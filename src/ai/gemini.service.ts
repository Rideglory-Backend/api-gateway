import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  AiDescriptionRequestDto,
  AiChatRole,
  AiErrorCode,
} from '@rideglory/contracts';

const SYSTEM_PROMPT = `Eres un asistente experto en redacción de eventos de motociclismo para la comunidad colombiana.
Tu tarea es generar descripciones atractivas, cálidas y entusiastas para eventos de moto en Colombia.
Escribe en español colombiano, con un tono cercano, apasionado y que invite a la participación.
Las descripciones deben ser en formato Markdown, bien estructuradas, con emojis relevantes y que resalten
la emoción y camaradería del mundo motorista. Sé conciso pero impactante.`;

@Injectable()
export class GeminiService {
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash';
  }

  async generateDescription(req: AiDescriptionRequestDto): Promise<string> {
    const { eventContext, history = [], userMessage } = req;

    const contextPrefix = `Contexto del evento:
- Título: ${eventContext.title}
- Tipo: ${eventContext.eventType}
- Ciudad: ${eventContext.city}${eventContext.difficulty ? `\n- Dificultad: ${eventContext.difficulty}` : ''}${eventContext.startDate ? `\n- Fecha: ${eventContext.startDate}` : ''}

`;

    const contents = [
      ...history.map((turn) => ({
        role: turn.role === AiChatRole.USER ? 'user' : 'model',
        parts: [{ text: turn.content }],
      })),
      {
        role: 'user',
        parts: [{ text: contextPrefix + userMessage }],
      },
    ];

    const geminiCall = this.ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(AiErrorCode.NETWORK_ERROR)),
        30_000,
      ),
    );

    let response: Awaited<ReturnType<typeof this.ai.models.generateContent>>;
    try {
      response = await Promise.race([geminiCall, timeoutPromise]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : AiErrorCode.NETWORK_ERROR;
      throw new Error(message === AiErrorCode.SAFETY_BLOCKED ? AiErrorCode.SAFETY_BLOCKED : AiErrorCode.NETWORK_ERROR);
    }

    if (
      response.promptFeedback?.blockReason ||
      !response.candidates ||
      response.candidates.length === 0 ||
      response.candidates[0].finishReason === 'SAFETY'
    ) {
      throw new Error(AiErrorCode.SAFETY_BLOCKED);
    }

    const text = response.text;
    if (!text) {
      throw new Error(AiErrorCode.SAFETY_BLOCKED);
    }

    return text;
  }
}
