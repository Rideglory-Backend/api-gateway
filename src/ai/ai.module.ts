import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AiQuotaService } from './ai-quota.service';
import { GeminiService } from './gemini.service';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageService } from './storage.service';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [GeminiService, StorageService, StorageCleanupService, AiQuotaService],
})
export class AiModule {}
