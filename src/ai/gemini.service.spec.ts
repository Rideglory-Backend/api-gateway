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

describe('GeminiService.generateCover', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Provide a valid API key so the constructor does not throw
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws Error("GEMINI_IMAGE_MODEL env var not set") and does NOT call the SDK when env var is missing', async () => {
    delete process.env.GEMINI_IMAGE_MODEL;
    const service = new GeminiService();

    await expect(service.generateCover('make a cover')).rejects.toThrow(
      'GEMINI_IMAGE_MODEL env var not set',
    );
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('throws Error("GEMINI_IMAGE_MODEL env var not set") and does NOT call the SDK when env var is empty string', async () => {
    process.env.GEMINI_IMAGE_MODEL = '';
    const service = new GeminiService();

    await expect(service.generateCover('make a cover')).rejects.toThrow(
      'GEMINI_IMAGE_MODEL env var not set',
    );
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('throws Error("Gemini did not return image data") when response has no inlineData', async () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
    const service = new GeminiService();

    // Response candidate with a text-only part (no inlineData)
    mockGenerateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'no image here' }] } }],
    });

    await expect(service.generateCover('make a cover')).rejects.toThrow(
      'Gemini did not return image data',
    );
  });

  it('throws Error("Gemini did not return image data") when candidates array is empty', async () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
    const service = new GeminiService();

    mockGenerateContent.mockResolvedValue({ candidates: [] });

    await expect(service.generateCover('make a cover')).rejects.toThrow(
      'Gemini did not return image data',
    );
  });

  it('returns buffer and mimeType when Gemini returns valid inlineData', async () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
    const service = new GeminiService();

    const base64Data = Buffer.from('fake-image').toString('base64');
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: base64Data, mimeType: 'image/png' } }],
          },
        },
      ],
    });

    const result = await service.generateCover('make a cover');

    expect(result.mimeType).toBe('image/png');
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.toString()).toBe('fake-image');
  });

  it('calls the SDK with the correct model and prompt', async () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
    const service = new GeminiService();

    const base64Data = Buffer.from('img').toString('base64');
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: base64Data, mimeType: 'image/jpeg' } }],
          },
        },
      ],
    });

    await service.generateCover('sunset mountain ride');

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: [{ role: 'user', parts: [{ text: 'sunset mountain ride' }] }],
      config: { responseModalities: ['IMAGE'] },
    });
  });

  it('throws quota_exceeded_project when SDK throws RESOURCE_EXHAUSTED', async () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
    const service = new GeminiService();

    mockGenerateContent.mockRejectedValue(
      new Error('RESOURCE_EXHAUSTED: quota exceeded'),
    );

    await expect(service.generateCover('make a cover')).rejects.toThrow('quota_exceeded_project');
  });

  it('throws quota_exceeded_project when SDK throws "Resource has been exhausted"', async () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
    const service = new GeminiService();

    mockGenerateContent.mockRejectedValue(
      new Error('Resource has been exhausted (check quota).'),
    );

    await expect(service.generateCover('make a cover')).rejects.toThrow('quota_exceeded_project');
  });

  it('throws safety_blocked when response has SAFETY finishReason', async () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
    const service = new GeminiService();

    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
    });

    await expect(service.generateCover('make a cover')).rejects.toThrow('safety_blocked');
  });

  it('throws network_error for generic SDK errors', async () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
    const service = new GeminiService();

    mockGenerateContent.mockRejectedValue(new Error('Connection refused'));

    await expect(service.generateCover('make a cover')).rejects.toThrow('network_error');
  });
});

describe('GeminiService.generateDescription — quota and error mapping', () => {
  const originalEnv = process.env;

  const validReq: AiDescriptionRequestDto = {
    eventContext: {
      title: 'Test',
      eventType: EventType.TOURISM,
      city: 'Bogotá',
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
