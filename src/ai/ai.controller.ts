import {
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiDescriptionRequestDto,
  AiDescriptionResponseDto,
  AiErrorCode,
} from '@rideglory/contracts';
import { GeminiService } from './gemini.service';

@Controller('ai')
export class AiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Post('description')
  async generateDescription(
    @Body() dto: AiDescriptionRequestDto,
  ): Promise<AiDescriptionResponseDto> {
    try {
      const markdown = await this.geminiService.generateDescription(dto);
      return { markdown, remainingGenerations: -1 };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === AiErrorCode.SAFETY_BLOCKED) {
        throw new UnprocessableEntityException({ error: AiErrorCode.SAFETY_BLOCKED });
      }
      throw new ServiceUnavailableException({ error: AiErrorCode.NETWORK_ERROR });
    }
  }
}
