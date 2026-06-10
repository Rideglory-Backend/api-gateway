import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  AiDescriptionRequestDto,
  AiChatRole,
  AiErrorCode,
} from '@rideglory/contracts';

const DESCRIPTION_MARKER = '{{DESCRIPTION}}';
const QUESTION_MARKER = '{{QUESTION}}';

const SYSTEM_PROMPT = `Eres un asistente creativo y apasionado para crear descripciones de eventos de motociclismo en Colombia. Tu estilo es vibrante, entusiasta y lleno de personalidad — usas emojis generosamente, titulares llamativos, frases con energía y un tono que le transmite emoción real al lector.

DETECCIÓN DE INTENCIÓN — aplica esta regla antes de responder:
- Si el mensaje del usuario describe detalles del evento, el tono deseado, aspectos a resaltar, recomendaciones o cualquier información concreta → genera la descripción INMEDIATAMENTE.
- Si el mensaje es un saludo vacío o completamente sin contexto (ejemplo exacto: "hola", "sí", "ok", "quiero una descripción") → haz máximo 2 preguntas concretas sobre tono y aspectos a destacar.

FORMATO OBLIGATORIO — cada respuesta DEBE comenzar con una de estas marcas en la primera línea:
- Cuando generas la descripción completa: comienza con "${DESCRIPTION_MARKER}"
- Cuando haces preguntas: comienza con "${QUESTION_MARKER}"

DESCRIPCIÓN (cuando aplica):
- Markdown rico: encabezados creativos, negritas para lo importante, listas con íconos, separadores visuales
- Emojis abundantes y bien ubicados (🏍️🔥⛰️🛣️💨🤘 y los que peguen con el evento)
- Tono apasionado, coloquial y colombiano — dinámico, informal pero sin groserías ni palabras vulgares
- Incluye secciones útiles cuando aplique: qué llevar, a quién va dirigido, qué esperar, recomendaciones
- Entre 150 y 350 palabras — suficiente para emocionar sin aburrir
- Permite iteraciones: ajusta tono, longitud o secciones si el usuario lo pide

PREGUNTAS (solo cuando el mensaje es realmente vago):
- Máximo 2 preguntas específicas
- Tono cálido y entusiasta

El contexto del evento (título, tipo, ciudad, dificultad, fecha) ya está dado. Úsalo directamente para darle vida a la descripción.`;

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

  async generateDescription(
    req: AiDescriptionRequestDto,
  ): Promise<{ text: string; isDescription: boolean }> {
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
      if (message === AiErrorCode.SAFETY_BLOCKED) {
        throw new Error(AiErrorCode.SAFETY_BLOCKED);
      }
      if (
        message.includes('RESOURCE_EXHAUSTED') ||
        message.includes('Resource has been exhausted') ||
        (error as { status?: number })?.status === 429
      ) {
        throw new Error(AiErrorCode.QUOTA_EXCEEDED_PROJECT);
      }
      throw new Error(AiErrorCode.NETWORK_ERROR);
    }

    if (
      response.promptFeedback?.blockReason ||
      !response.candidates ||
      response.candidates.length === 0 ||
      response.candidates[0].finishReason === 'SAFETY'
    ) {
      throw new Error(AiErrorCode.SAFETY_BLOCKED);
    }

    const rawText = response.text;
    if (!rawText) {
      throw new Error(AiErrorCode.SAFETY_BLOCKED);
    }

    const isDescription = rawText.trimStart().startsWith(DESCRIPTION_MARKER);
    const text = rawText
      .replace(new RegExp(`^\\s*\\{\\{(DESCRIPTION|QUESTION)\\}\\}\\s*\n?`), '')
      .trim();

    return { text, isDescription };
  }

}
