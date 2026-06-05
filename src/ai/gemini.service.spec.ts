import { GeminiService } from './gemini.service';

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
});
