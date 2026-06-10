import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getApps } from 'firebase-admin/app';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import { AiErrorCode } from '@rideglory/contracts';
import { envs } from '../config/envs';

export type QuotaType = 'description';

interface CachedLimits {
  description: number;
  expireAt: number;
}

@Injectable()
export class AiQuotaService {
  private readonly prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: envs.databaseUrl }) });
  private cachedLimits: CachedLimits | null = null;

  async checkLimit(userId: string, type: QuotaType): Promise<void> {
    const limits = await this.getLimits();
    const limit = limits[type];
    const dayKey = new Date().toISOString().slice(0, 10);
    const countField =
      'descriptionCount';

    const row = await this.prisma.aiUsageQuota.findUnique({
      where: { userId_date: { userId, date: dayKey } },
    });
    const count = row ? (row[countField] as number) : 0;

    if (count >= limit) {
      throw new HttpException(
        { error: AiErrorCode.QUOTA_EXCEEDED_USER, message: AiErrorCode.QUOTA_EXCEEDED_USER, remaining: 0 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async increment(userId: string, type: QuotaType): Promise<number> {
    const limits = await this.getLimits();
    const limit = limits[type];
    const dayKey = new Date().toISOString().slice(0, 10);
    const countField =
      'descriptionCount';

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.aiUsageQuota.findUnique({
        where: { userId_date: { userId, date: dayKey } },
      });
      const count = row ? (row[countField] as number) : 0;

      await tx.aiUsageQuota.upsert({
        where: { userId_date: { userId, date: dayKey } },
        create: { userId, date: dayKey, [countField]: 1 },
        update: { [countField]: { increment: 1 } },
      });

      return Math.max(0, limit - (count + 1));
    });
  }

  async getRemainingQuota(userId: string, type: QuotaType): Promise<number> {
    const limits = await this.getLimits();
    const limit = limits[type];
    const dayKey = new Date().toISOString().slice(0, 10);
    const countField =
      'descriptionCount';

    const row = await this.prisma.aiUsageQuota.findUnique({
      where: { userId_date: { userId, date: dayKey } },
    });

    const count = row ? (row[countField] as number) : 0;
    return Math.max(0, limit - count);
  }

  async checkAndIncrement(userId: string, type: QuotaType): Promise<number> {
    const limits = await this.getLimits();
    const limit = limits[type];
    const dayKey = new Date().toISOString().slice(0, 10);
    const countField =
      'descriptionCount';

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.aiUsageQuota.findUnique({
        where: { userId_date: { userId, date: dayKey } },
      });

      const count = row ? (row[countField] as number) : 0;

      if (count >= limit) {
        throw new HttpException(
          { error: AiErrorCode.QUOTA_EXCEEDED_USER, remaining: 0 },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await tx.aiUsageQuota.upsert({
        where: { userId_date: { userId, date: dayKey } },
        create: { userId, date: dayKey, [countField]: 1 },
        update: { [countField]: { increment: 1 } },
      });

      return limit - (count + 1);
    });
  }

  private async getLimits(): Promise<CachedLimits> {
    if (this.cachedLimits && Date.now() < this.cachedLimits.expireAt) {
      return this.cachedLimits;
    }

    const app = getApps()[0];
    const rc = getRemoteConfig(app);

    let description = 10;

    try {
      const template = await rc.getTemplate();
      const params = template.parameters;

      const descParam = params['ai_description_daily_limit'];
      if (descParam?.defaultValue && 'value' in descParam.defaultValue) {
        const parsed = parseInt(descParam.defaultValue.value as string, 10);
        if (!isNaN(parsed) && parsed > 0) description = parsed;
      }
    } catch {
      // Remote Config unavailable — use fallback values
    }

    this.cachedLimits = {
      description,
      expireAt: Date.now() + 5 * 60 * 1000,
    };

    return this.cachedLimits;
  }
}
