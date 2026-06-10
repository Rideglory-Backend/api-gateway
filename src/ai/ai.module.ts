import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AiQuotaCleanupService } from './ai-quota-cleanup.service';
import { AiQuotaService } from './ai-quota.service';
import { GeminiService } from './gemini.service';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [GeminiService, AiQuotaService, AiQuotaCleanupService],
})
export class AiModule {}
