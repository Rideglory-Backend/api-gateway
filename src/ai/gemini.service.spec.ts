import { GeminiService } from './gemini.service';
import { AiErrorCode } from '@rideglory/contracts';
import { AiDescriptionRequestDto, EventType, AiChatRole } from '@rideglory/contracts';

// Mock @google/genai so real HTTP calls are never made
const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

describe('GeminiService.generateDescription — quota and error mapping', () => {
  const originalEnv = process.env;

  const validReq: AiDescriptionRequestDto = {
    eventContext: {
      title: 'Test',
      eventType: EventType.TOURISM,
    },
    userMessage: 'genera descripción',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws quota_exceeded_project when SDK throws RESOURCE_EXHAUSTED', async () => {
    const service = new GeminiService();
    mockGenerateContent.mockRejectedValue(new Error('RESOURCE_EXHAUSTED: quota exceeded'));

    await expect(service.generateDescription(validReq)).rejects.toThrow(
      AiErrorCode.QUOTA_EXCEEDED_PROJECT,
    );
  });

  it('throws quota_exceeded_project when SDK throws "Resource has been exhausted"', async () => {
    const service = new GeminiService();
    mockGenerateContent.mockRejectedValue(
      new Error('Resource has been exhausted (check quota).'),
    );

    await expect(service.generateDescription(validReq)).rejects.toThrow(
      AiErrorCode.QUOTA_EXCEEDED_PROJECT,
    );
  });

  it('throws network_error for generic SDK errors', async () => {
    const service = new GeminiService();
    mockGenerateContent.mockRejectedValue(new Error('Connection timeout'));

    await expect(service.generateDescription(validReq)).rejects.toThrow(
      AiErrorCode.NETWORK_ERROR,
    );
  });
});
