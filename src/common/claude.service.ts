import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class ClaudeService {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateSearchQuery(
    title: string,
    eventType: string,
    city: string,
  ): Promise<string> {
    try {
      const message = await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 64,
        messages: [
          {
            role: 'user',
            content: `Generate a 3-5 word English search query for Unsplash to find a high-quality landscape photo for a motorcycle event. Event title: ${title}. Event type: ${eventType}. City: ${city}. Return only the search query, nothing else.`,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new ServiceUnavailableException(
          'Unexpected Claude response type',
        );
      }

      return content.text.trim();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Claude service is currently unavailable',
      );
    }
  }
}
