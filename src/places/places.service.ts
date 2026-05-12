import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { envs } from '../config/envs';

type PlaceType = 'cities' | 'establishment';

@Injectable()
export class PlacesService {
  async autocomplete(query: string, type: PlaceType): Promise<string[]> {
    if (!envs.googlePlacesApiKey) {
      throw new HttpException(
        {
          code: 'PLACES_API_NOT_CONFIGURED',
          message:
            'Google Places API key is not configured. Set GOOGLE_PLACES_API_KEY on api-gateway.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const placesType = type === 'cities' ? '(cities)' : 'establishment';
    const uri = new URL(
      'https://maps.googleapis.com/maps/api/place/autocomplete/json',
    );
    uri.searchParams.set('input', query);
    uri.searchParams.set('types', placesType);
    uri.searchParams.set('language', 'es');
    uri.searchParams.set('key', envs.googlePlacesApiKey);

    const response = await fetch(uri.toString());
    if (!response.ok) {
      throw new HttpException(
        {
          code: 'PLACES_API_REQUEST_FAILED',
          message: 'Google Places API request failed.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const body = (await response.json()) as {
      predictions?: Array<{ description?: string }>;
    };
    return (body.predictions ?? ([] as Array<{ description?: string }>))
      .map((prediction) => prediction.description ?? '')
      .filter((value) => value.trim().length > 0);
  }
}
