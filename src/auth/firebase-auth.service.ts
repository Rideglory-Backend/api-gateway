import { Injectable, UnauthorizedException } from '@nestjs/common';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseAuthService {
  private readonly firebaseApp: App;

  constructor() {
    this.firebaseApp = this.initializeFirebaseApp();
  }

  async verifyToken(token: string): Promise<DecodedIdToken> {
    try {
      return await getAuth(this.firebaseApp).verifyIdToken(token);
    } catch (error) {
      console.error('[FirebaseAuth] verifyIdToken failed:', error);
      throw new UnauthorizedException('Invalid or expired Firebase token');
    }
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      await getAuth(this.firebaseApp).deleteUser(uid);
    } catch (error) {
      if ((error as { code?: string })?.code === 'auth/user-not-found') {
        // El usuario de Firebase Auth ya fue borrado en una corrida previa
        // (reintento tras éxito total, o carrera con otra petición en
        // vuelo). No-op idempotente: no relanzar.
        console.warn(`[FirebaseAuth] deleteUser: uid ${uid} already deleted, idempotent no-op`);
        return;
      }
      console.error('[FirebaseAuth] deleteUser failed:', error);
      throw error;
    }
  }

  private initializeFirebaseApp(): App {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      return existingApps[0];
    }

    const serviceAccount = this.getServiceAccountFromEnv();
    if (serviceAccount) {
      return initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        'Firebase auth misconfigured: set FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_JSON',
      );
    }

    return initializeApp({ projectId, storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
  }

  private getServiceAccountFromEnv(): Record<string, string> | null {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!rawJson) {
      return null;
    }

    try {
      return JSON.parse(rawJson) as Record<string, string>;
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }
}
