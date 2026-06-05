import { Injectable, Logger } from '@nestjs/common';
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  async uploadCover(
    userId: string,
    draftId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = MIME_TO_EXT[mimeType] ?? 'png';
    const filePath = `pending/${userId}/${draftId}.${ext}`;
    const bucket = getStorage(getApps()[0]).bucket();
    const file = bucket.file(filePath);

    await file.save(buffer, { contentType: mimeType });

    // GATE DÍA 1: makePublic() funciona cuando el bucket NO tiene UBLA (Uniform Bucket-Level Access).
    // Si el bucket tiene UBLA activo, makePublic() lanzará un error; en ese caso cambiar a:
    //   const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    //   return url;
    // y documentar la opción elegida aquí.
    // Estrategia actual: makePublic() + URL pública estática (sin UBLA).
    await file.makePublic();
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    this.logger.log(`Cover uploaded: ${imageUrl}`);
    return imageUrl;
  }
}
