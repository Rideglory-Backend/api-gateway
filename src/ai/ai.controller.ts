import {
  Body,
  Controller,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AiCoverRequestDto,
  AiCoverResponseDto,
  AiDescriptionRequestDto,
  AiDescriptionResponseDto,
  AiErrorCode,
} from '@rideglory/contracts';
import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { GeminiService } from './gemini.service';
import { StorageService } from './storage.service';

type AuthenticatedRequest = Request & { user?: DecodedIdToken };

@Controller('ai')
export class AiController {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly storageService: StorageService,
  ) {}

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

  @Post('cover')
  async generateCover(
    @Body() dto: AiCoverRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AiCoverResponseDto> {
    const userId = request.user!.uid;
    const { buffer, mimeType } = await this.geminiService.generateCover(dto.prompt);
    const imageUrl = await this.storageService.uploadCover(userId, dto.draftId, buffer, mimeType);
    return { imageUrl, remainingGenerations: -1 };
  }
}
