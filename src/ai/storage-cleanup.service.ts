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

  /**
   * Best-effort batch delete of Firebase Storage objects referenced by a list
   * of download URLs (e.g. Vehicle.imageUrl, Soat.documentUrl,
   * Tecnomecanica.documentUrl). Never throws — each file is deleted in its
   * own try/catch so a missing object or a corrupt URL never aborts the
   * batch or the caller's flow (account deletion).
   */
  async deleteFilesByUrls(urls: Array<string | null | undefined>): Promise<void> {
    const validUrls = urls.filter((url): url is string => !!url);
    if (validUrls.length === 0) {
      return;
    }

    const bucket = getStorage(getApps()[0]).bucket();

    for (const url of validUrls) {
      const path = this.extractStoragePath(url, bucket.name);
      if (!path) {
        this.logger.warn(`StorageCleanup: could not parse storage path from URL: ${url}`);
        continue;
      }

      try {
        await bucket.file(path).delete();
      } catch (error) {
        this.logger.warn(`StorageCleanup: failed to delete file at "${path}": ${error}`);
      }
    }
  }

  private extractStoragePath(url: string, bucketName: string): string | null {
    // Firebase SDK download URL: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token=...
    const encodedMatch = url.match(/\/o\/([^?]+)/);
    if (encodedMatch) {
      try {
        return decodeURIComponent(encodedMatch[1]);
      } catch {
        return null;
      }
    }

    // Public URL format (StorageService.uploadCover): https://storage.googleapis.com/{bucket}/{path}
    const prefix = `https://storage.googleapis.com/${bucketName}/`;
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length);
    }

    return null;
  }
}
