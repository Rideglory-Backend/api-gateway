import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { GeminiService } from './gemini.service';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [AiController],
  providers: [GeminiService, StorageService, StorageCleanupService],
})
export class AiModule {}
