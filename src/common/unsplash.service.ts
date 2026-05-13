import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { type AxiosResponse } from 'axios';

interface UnsplashSearchResponse {
  results: Array<{ urls: { regular: string } }>;
}

@Injectable()
export class UnsplashService {
  private readonly baseUrl = 'https://api.unsplash.com';
  private readonly timeoutMs = 15_000;

  async searchPhoto(query: string): Promise<string> {
    try {
      const response: AxiosResponse<UnsplashSearchResponse> = await axios.get(
        `${this.baseUrl}/search/photos`,
        {
          params: {
            query,
            per_page: 1,
            orientation: 'landscape',
          },
          headers: {
            Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
          },
          timeout: this.timeoutMs,
        },
      );

      const results = response.data.results;
      if (!results || results.length === 0) {
        throw new ServiceUnavailableException(
          'No photos found for the generated query',
        );
      }

      const photo = results[0];
      const imageUrl = photo.urls.regular;
      if (!imageUrl) {
        throw new ServiceUnavailableException(
          'Unsplash response missing image URL',
        );
      }

      return imageUrl;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Unsplash service is currently unavailable',
      );
    }
  }
}
