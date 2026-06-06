import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnprocessableEntityException,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { AiController } from './ai.controller';
import { GeminiService } from './gemini.service';
import { StorageService } from './storage.service';
import { AiQuotaService } from './ai-quota.service';
import {
  AiDescriptionRequestDto,
  AiChatRole,
  AiErrorCode,
  EventType,
} from '@rideglory/contracts';

const mockGeminiService = {
  generateDescription: jest.fn(),
  generateCover: jest.fn(),
};

const mockStorageService = {
  uploadCover: jest.fn(),
};

const mockQuotaService = {
  checkAndIncrement: jest.fn(),
};

const validDto: AiDescriptionRequestDto = {
  eventContext: {
    title: 'Ruta de los Andes',
    eventType: EventType.TOURISM,
    city: 'Medellín',
  },
  userMessage: 'Genera una descripción emocionante para este evento.',
};

const fakeRequest = { user: { uid: 'user-123' } } as any;

describe('AiController', () => {
  let controller: AiController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQuotaService.checkAndIncrement.mockResolvedValue(9);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: GeminiService, useValue: mockGeminiService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: AiQuotaService, useValue: mockQuotaService },
      ],
    }).compile();

    controller = module.get<AiController>(AiController);
  });

  describe('generateDescription — success 200', () => {
    it('returns markdown and remainingGenerations from quota service', async () => {
      const generatedMarkdown = '## Ruta de los Andes\nUna increíble ruta...';
      mockGeminiService.generateDescription.mockResolvedValue(generatedMarkdown);
      mockQuotaService.checkAndIncrement.mockResolvedValue(7);

      const result = await controller.generateDescription(validDto, fakeRequest);

      expect(result).toEqual({
        markdown: generatedMarkdown,
        remainingGenerations: 7,
      });
      expect(mockGeminiService.generateDescription).toHaveBeenCalledWith(validDto);
      expect(mockQuotaService.checkAndIncrement).toHaveBeenCalledWith('user-123', 'description');
    });
  });

  describe('generateDescription — network_error → 503', () => {
    it('throws ServiceUnavailableException with error: network_error', async () => {
      mockGeminiService.generateDescription.mockRejectedValue(
        new Error(AiErrorCode.NETWORK_ERROR),
      );

      await expect(controller.generateDescription(validDto, fakeRequest)).rejects.toThrow(
        ServiceUnavailableException,
      );

      try {
        await controller.generateDescription(validDto, fakeRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
          error: AiErrorCode.NETWORK_ERROR,
        });
      }
    });
  });

  describe('generateDescription — safety_blocked → 422', () => {
    it('throws UnprocessableEntityException with error: safety_blocked', async () => {
      mockGeminiService.generateDescription.mockRejectedValue(
        new Error(AiErrorCode.SAFETY_BLOCKED),
      );

      await expect(controller.generateDescription(validDto, fakeRequest)).rejects.toThrow(
        UnprocessableEntityException,
      );

      try {
        await controller.generateDescription(validDto, fakeRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          error: AiErrorCode.SAFETY_BLOCKED,
        });
      }
    });
  });

  describe('generateDescription — quota_exceeded_project → 429', () => {
    it('throws HttpException(429) with error: quota_exceeded_project', async () => {
      mockGeminiService.generateDescription.mockRejectedValue(
        new Error(AiErrorCode.QUOTA_EXCEEDED_PROJECT),
      );

      await expect(controller.generateDescription(validDto, fakeRequest)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.generateDescription(validDto, fakeRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect((error as HttpException).getResponse()).toEqual({
          error: AiErrorCode.QUOTA_EXCEEDED_PROJECT,
        });
      }
    });
  });

  describe('generateDescription — quota_exceeded_user → 429', () => {
    it('propagates HttpException(429) from quota service with error: quota_exceeded_user', async () => {
      mockQuotaService.checkAndIncrement.mockRejectedValue(
        new HttpException(
          { error: AiErrorCode.QUOTA_EXCEEDED_USER, remaining: 0 },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      await expect(controller.generateDescription(validDto, fakeRequest)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.generateDescription(validDto, fakeRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect((error as HttpException).getResponse()).toEqual({
          error: AiErrorCode.QUOTA_EXCEEDED_USER,
          remaining: 0,
        });
      }
    });
  });

  describe('body inválido → 400', () => {
    it('throws BadRequestException when eventContext.title is missing', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const dto = {
        eventContext: { eventType: EventType.TOURISM, city: 'Medellín' },
        userMessage: 'Genera una descripción.',
      };

      await expect(
        pipe.transform(dto, { type: 'body', metatype: AiDescriptionRequestDto }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('history vacío → 200', () => {
    it('succeeds when history is an empty array', async () => {
      const markdown = '## Evento\nDescripción...';
      mockGeminiService.generateDescription.mockResolvedValue(markdown);
      mockQuotaService.checkAndIncrement.mockResolvedValue(5);

      const dtoWithEmptyHistory: AiDescriptionRequestDto = {
        ...validDto,
        history: [],
      };

      const result = await controller.generateDescription(dtoWithEmptyHistory, fakeRequest);
      expect(result.markdown).toBe(markdown);
      expect(result.remainingGenerations).toBe(5);
    });
  });

  describe('generateCover — success 200', () => {
    const coverDto = { prompt: 'Ruta por los Andes', draftId: '550e8400-e29b-41d4-a716-446655440000' };

    it('returns imageUrl and remainingGenerations from quota service', async () => {
      mockGeminiService.generateCover.mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/png' });
      mockStorageService.uploadCover.mockResolvedValue('https://storage.googleapis.com/bucket/pending/user-123/550e8400-e29b-41d4-a716-446655440000.png');
      mockQuotaService.checkAndIncrement.mockResolvedValue(4);

      const result = await controller.generateCover(coverDto, fakeRequest);

      expect(result.imageUrl).toBe('https://storage.googleapis.com/bucket/pending/user-123/550e8400-e29b-41d4-a716-446655440000.png');
      expect(result.remainingGenerations).toBe(4);
      expect(mockGeminiService.generateCover).toHaveBeenCalledWith(coverDto.prompt);
      expect(mockStorageService.uploadCover).toHaveBeenCalledWith('user-123', coverDto.draftId, expect.any(Buffer), 'image/png');
      expect(mockQuotaService.checkAndIncrement).toHaveBeenCalledWith('user-123', 'cover');
    });
  });

  describe('generateCover — safety_blocked → 422', () => {
    const coverDto = { prompt: 'bad prompt', draftId: 'draft-1' };

    it('throws UnprocessableEntityException with error: safety_blocked', async () => {
      mockGeminiService.generateCover.mockRejectedValue(new Error(AiErrorCode.SAFETY_BLOCKED));

      await expect(controller.generateCover(coverDto, fakeRequest)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('generateCover — quota_exceeded_project → 429', () => {
    const coverDto = { prompt: 'any prompt', draftId: 'draft-2' };

    it('throws HttpException(429) with error: quota_exceeded_project', async () => {
      mockGeminiService.generateCover.mockRejectedValue(
        new Error(AiErrorCode.QUOTA_EXCEEDED_PROJECT),
      );

      await expect(controller.generateCover(coverDto, fakeRequest)).rejects.toThrow(HttpException);

      try {
        await controller.generateCover(coverDto, fakeRequest);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect((error as HttpException).getResponse()).toEqual({
          error: AiErrorCode.QUOTA_EXCEEDED_PROJECT,
        });
      }
    });
  });

  describe('generateCover — quota_exceeded_user → 429', () => {
    const coverDto = { prompt: 'any prompt', draftId: 'draft-3' };

    it('propagates HttpException(429) from quota service with body {error: quota_exceeded_user, remaining: 0}', async () => {
      mockQuotaService.checkAndIncrement.mockRejectedValue(
        new HttpException(
          { error: AiErrorCode.QUOTA_EXCEEDED_USER, remaining: 0 },
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      await expect(controller.generateCover(coverDto, fakeRequest)).rejects.toThrow(HttpException);

      // AC2 hardening: assert body contract {error: quota_exceeded_user, remaining: 0}
      try {
        await controller.generateCover(coverDto, fakeRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect((error as HttpException).getResponse()).toEqual({
          error: AiErrorCode.QUOTA_EXCEEDED_USER,
          remaining: 0,
        });
      }
    });
  });

  describe('generateCover — network_error → 503', () => {
    const coverDto = { prompt: 'any prompt', draftId: 'draft-4' };

    it('throws ServiceUnavailableException with error: network_error', async () => {
      mockGeminiService.generateCover.mockRejectedValue(new Error(AiErrorCode.NETWORK_ERROR));

      await expect(controller.generateCover(coverDto, fakeRequest)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});

describe('GeminiService — constructor', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws Error when GEMINI_API_KEY is not set', () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => {
      const { GeminiService: GS } = jest.requireActual('./gemini.service');
      new GS();
    }).toThrow('GEMINI_API_KEY is required');
  });

  it('throws Error when GEMINI_API_KEY is empty string', () => {
    process.env.GEMINI_API_KEY = '';

    expect(() => {
      const { GeminiService: GS } = jest.requireActual('./gemini.service');
      new GS();
    }).toThrow('GEMINI_API_KEY is required');
  });
});
