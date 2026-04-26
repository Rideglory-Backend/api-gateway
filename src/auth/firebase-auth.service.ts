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
      return await getAuth(this.firebaseApp).verifyIdToken(token, true);
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase token');
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
      });
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error(
        'Firebase auth misconfigured: set FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_JSON',
      );
    }

    return initializeApp({ projectId });
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
