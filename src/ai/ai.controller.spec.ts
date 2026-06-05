import { Test, TestingModule } from '@nestjs/testing';
import {
  ServiceUnavailableException,
  UnprocessableEntityException,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { AiController } from './ai.controller';
import { GeminiService } from './gemini.service';
import {
  AiDescriptionRequestDto,
  AiChatRole,
  AiErrorCode,
  EventType,
} from '@rideglory/contracts';

const mockGeminiService = {
  generateDescription: jest.fn(),
};

const validDto: AiDescriptionRequestDto = {
  eventContext: {
    title: 'Ruta de los Andes',
    eventType: EventType.TOURISM,
    city: 'Medellín',
  },
  userMessage: 'Genera una descripción emocionante para este evento.',
};

describe('AiController', () => {
  let controller: AiController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: GeminiService, useValue: mockGeminiService },
      ],
    }).compile();

    controller = module.get<AiController>(AiController);
  });

  describe('success 200', () => {
    it('returns markdown and remainingGenerations: -1', async () => {
      const generatedMarkdown = '## Ruta de los Andes\nUna increíble ruta...';
      mockGeminiService.generateDescription.mockResolvedValue(generatedMarkdown);

      const result = await controller.generateDescription(validDto);

      expect(result).toEqual({
        markdown: generatedMarkdown,
        remainingGenerations: -1,
      });
      expect(mockGeminiService.generateDescription).toHaveBeenCalledWith(validDto);
    });
  });

  describe('network_error → 503', () => {
    it('throws ServiceUnavailableException with error: network_error', async () => {
      mockGeminiService.generateDescription.mockRejectedValue(
        new Error(AiErrorCode.NETWORK_ERROR),
      );

      await expect(controller.generateDescription(validDto)).rejects.toThrow(
        ServiceUnavailableException,
      );

      try {
        await controller.generateDescription(validDto);
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
          error: AiErrorCode.NETWORK_ERROR,
        });
      }
    });
  });

  describe('safety_blocked → 422', () => {
    it('throws UnprocessableEntityException with error: safety_blocked', async () => {
      mockGeminiService.generateDescription.mockRejectedValue(
        new Error(AiErrorCode.SAFETY_BLOCKED),
      );

      await expect(controller.generateDescription(validDto)).rejects.toThrow(
        UnprocessableEntityException,
      );

      try {
        await controller.generateDescription(validDto);
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          error: AiErrorCode.SAFETY_BLOCKED,
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

      const dtoWithEmptyHistory: AiDescriptionRequestDto = {
        ...validDto,
        history: [],
      };

      const result = await controller.generateDescription(dtoWithEmptyHistory);
      expect(result.markdown).toBe(markdown);
      expect(result.remainingGenerations).toBe(-1);
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
