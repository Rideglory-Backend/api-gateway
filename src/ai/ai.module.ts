import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { GeminiService } from './gemini.service';

@Module({
  controllers: [AiController],
  providers: [GeminiService],
})
export class AiModule {}
