/**
 * ai-description.spec.ts
 *
 * Cobertura adicional para gaps genuinos no cubiertos en
 * ai.controller.spec.ts y gemini.service.spec.ts:
 *
 * Suite A — Validación DTO: history > 10 turnos → 400 BadRequestException
 * Suite B — GeminiService.generateDescription: happy path (isDescription true/false)
 *           y safety_blocked desde error de SDK
 */

jest.mock('../config/envs', () => ({ envs: { databaseUrl: 'postgresql://test' } }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));

// Mock @google/genai — must be hoisted before GeminiService import
const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AiDescriptionRequestDto,
  AiChatRole,
  AiErrorCode,
  EventType,
} from '@rideglory/contracts';
import { GeminiService } from './gemini.service';

// ---------------------------------------------------------------------------
// Suite A: DTO validation — history > 10 turnos → BadRequestException (400)
// ---------------------------------------------------------------------------

describe('AiDescriptionRequestDto validation — history > 10', () => {
  it('throws BadRequestException when history has more than 10 turns', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const dto = {
      eventContext: {
        title: 'Test Event',
        eventType: EventType.TOURISM,
      },
      userMessage: 'Test',
      history: Array.from({ length: 11 }, (_, i) => ({
        role: i % 2 === 0 ? AiChatRole.USER : AiChatRole.MODEL,
        content: `Turn ${i}`,
      })),
    };

    await expect(
      pipe.transform(dto, { type: 'body', metatype: AiDescriptionRequestDto }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts history with exactly 10 turns', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const dto = {
      eventContext: {
        title: 'Test Event',
        eventType: EventType.TOURISM,
      },
      userMessage: 'Test',
      history: Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? AiChatRole.USER : AiChatRole.MODEL,
        content: `Turn ${i}`,
      })),
    };

    await expect(
      pipe.transform(dto, { type: 'body', metatype: AiDescriptionRequestDto }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Suite B: GeminiService.generateDescription — happy path e isDescription
// ---------------------------------------------------------------------------

describe('GeminiService.generateDescription — happy path and safety', () => {
  const validReq: AiDescriptionRequestDto = {
    eventContext: {
      title: 'Test Event',
      eventType: EventType.TOURISM,
    },
    userMessage: 'genera descripción',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('returns isDescription: true when model response starts with {{DESCRIPTION}} marker', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{{DESCRIPTION}}\n## Ruta épica\nUna ruta increíble...',
      candidates: [{ finishReason: 'STOP' }],
    });

    const service = new GeminiService();
    const result = await service.generateDescription(validReq);

    expect(result.isDescription).toBe(true);
    expect(result.text).toContain('Ruta épica');
  });

  it('returns isDescription: false when model response starts with {{QUESTION}} marker', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{{QUESTION}}\n¿Cuál es la duración estimada del evento?',
      candidates: [{ finishReason: 'STOP' }],
    });

    const service = new GeminiService();
    const result = await service.generateDescription(validReq);

    expect(result.isDescription).toBe(false);
    expect(result.text).toContain('duración estimada');
  });

  it('throws Error(AiErrorCode.SAFETY_BLOCKED) when SDK throws safety_blocked error', async () => {
    mockGenerateContent.mockRejectedValue(new Error(AiErrorCode.SAFETY_BLOCKED));

    const service = new GeminiService();
    await expect(service.generateDescription(validReq)).rejects.toThrow(
      AiErrorCode.SAFETY_BLOCKED,
    );
  });
});
