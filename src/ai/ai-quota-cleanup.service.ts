import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { envs } from '../config/envs';

@Injectable()
export class AiQuotaCleanupService {
  private readonly logger = new Logger(AiQuotaCleanupService.name);
  private readonly prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: envs.databaseUrl }) });

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'America/Bogota' })
  async cleanupOldQuotas(): Promise<void> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 2);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const result = await this.prisma.aiUsageQuota.deleteMany({
      where: { date: { lt: cutoffDate } },
    });

    this.logger.log(`AI quota cleanup: deleted ${result.count} records older than ${cutoffDate}`);
  }
}
