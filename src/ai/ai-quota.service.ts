import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import { AiErrorCode } from '@rideglory/contracts';

export type QuotaType = 'description' | 'cover';

interface CachedLimits {
  description: number;
  cover: number;
  expireAt: number; // Date.now() ms
}

@Injectable()
export class AiQuotaService {
  private cachedLimits: CachedLimits | null = null;

  /**
   * Atomically checks and increments the daily quota for the given user and type.
   * Throws HttpException(429) if the user has reached their daily limit.
   * Returns the remaining quota after the increment.
   */
  async checkAndIncrement(userId: string, type: QuotaType): Promise<number> {
    const limits = await this.getLimits();
    const limit = limits[type];

    const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const db = getFirestore(getApps()[0]);
    const docRef = db
      .collection('ai_usage_quotas')
      .doc(userId)
      .collection('days')
      .doc(dayKey);

    const countField = type === 'description' ? 'descriptionCount' : 'coverCount';

    const remaining = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const now = Timestamp.now();

      let count = 0;
      let createdAt: Timestamp = now;

      if (snap.exists) {
        const data = snap.data()!;
        count = (data[countField] as number | undefined) ?? 0;
        createdAt = (data['createdAt'] as Timestamp | undefined) ?? now;
      }

      if (count >= limit) {
        throw new HttpException(
          { error: AiErrorCode.QUOTA_EXCEEDED_USER, remaining: 0 },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const expireAt = Timestamp.fromMillis(
        createdAt.toMillis() + 2 * 24 * 60 * 60 * 1000,
      );

      tx.set(
        docRef,
        {
          [countField]: FieldValue.increment(1),
          createdAt,
          expireAt,
        },
        { merge: true },
      );

      return limit - (count + 1);
    });

    return remaining;
  }

  private async getLimits(): Promise<CachedLimits> {
    if (this.cachedLimits && Date.now() < this.cachedLimits.expireAt) {
      return this.cachedLimits;
    }

    const app = getApps()[0];
    const rc = getRemoteConfig(app);

    let description = 10;
    let cover = 5;

    try {
      const template = await rc.getTemplate();
      const params = template.parameters;

      const descParam = params['ai_description_daily_limit'];
      if (descParam?.defaultValue && 'value' in descParam.defaultValue) {
        const parsed = parseInt(descParam.defaultValue.value as string, 10);
        if (!isNaN(parsed) && parsed > 0) description = parsed;
      }

      const coverParam = params['ai_cover_daily_limit'];
      if (coverParam?.defaultValue && 'value' in coverParam.defaultValue) {
        const parsed = parseInt(coverParam.defaultValue.value as string, 10);
        if (!isNaN(parsed) && parsed > 0) cover = parsed;
      }
    } catch {
      // Remote Config unavailable — use fallback values
    }

    this.cachedLimits = {
      description,
      cover,
      expireAt: Date.now() + 5 * 60 * 1000,
    };

    return this.cachedLimits;
  }
}
