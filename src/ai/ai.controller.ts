import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiDescriptionRequestDto,
  AiDescriptionResponseDto,
  AiErrorCode,
} from '@rideglory/contracts';
import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { AiQuotaService } from './ai-quota.service';
import { GeminiService } from './gemini.service';

type AuthenticatedRequest = Request & { user?: DecodedIdToken };

@Controller('ai')
export class AiController {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly quotaService: AiQuotaService,
  ) {}

  @Get('quota')
  async getQuota(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ descriptionRemaining: number }> {
    const userId = request.user!.uid;
    const descriptionRemaining = await this.quotaService.getRemainingQuota(
      userId,
      'description',
    );
    return { descriptionRemaining };
  }

  @Post('description')
  async generateDescription(
    @Body() dto: AiDescriptionRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AiDescriptionResponseDto> {
    const userId = request.user!.uid;

    // Check limit before generating (throws 429 if exhausted, no increment yet)
    await this.quotaService.checkLimit(userId, 'description');

    let result: { text: string; isDescription: boolean };
    try {
      result = await this.geminiService.generateDescription(dto);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === AiErrorCode.SAFETY_BLOCKED) {
        throw new UnprocessableEntityException({ error: AiErrorCode.SAFETY_BLOCKED });
      }
      if (message === AiErrorCode.QUOTA_EXCEEDED_PROJECT) {
        throw new HttpException(
          { error: AiErrorCode.QUOTA_EXCEEDED_PROJECT },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new ServiceUnavailableException({ error: AiErrorCode.NETWORK_ERROR });
    }

    // Consume quota only when the AI actually generated a description
    const remainingGenerations = result.isDescription
      ? await this.quotaService.increment(userId, 'description')
      : await this.quotaService.getRemainingQuota(userId, 'description');

    return {
      markdown: result.text,
      remainingGenerations,
      isDescription: result.isDescription,
    };
  }

}
