import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  @Cron('0 3 * * 0', { timeZone: 'America/Bogota' })
  async cleanPendingCovers(): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const bucket = getStorage(getApps()[0]).bucket();
    const [files] = await bucket.getFiles({ prefix: 'pending/' });

    let deleted = 0;
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      if (new Date(metadata.timeCreated as string) < sevenDaysAgo) {
        await file.delete();
        deleted++;
      }
    }
    this.logger.log(`StorageCleanup: deleted ${deleted} stale pending covers`);
  }
}
