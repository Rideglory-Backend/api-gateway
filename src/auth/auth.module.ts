import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { FirebaseAuthService } from './firebase-auth.service';

@Module({
  providers: [
    FirebaseAuthService,
    {
      provide: APP_GUARD,
      useClass: FirebaseAuthGuard,
    },
  ],
  exports: [FirebaseAuthService],
})
export class AuthModule {}
