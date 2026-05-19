import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { envs } from '../config/envs';
import { searchCities } from './colombia-cities.data';

type PlaceType = 'cities' | 'establishment';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

@Injectable()
export class PlacesService {
  autocomplete(query: string, type: PlaceType): string[] {
    if (type === 'establishment') {
      return [];
    }
    return searchCities(query.trim());
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const mapboxToken = envs.mapboxAccessToken;
    if (!mapboxToken) {
      throw new HttpException(
        {
          code: 'GEOCODE_API_NOT_CONFIGURED',
          message: 'MAPBOX_ACCESS_TOKEN is not configured.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const encodedAddress = encodeURIComponent(address);
    const uri = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1&language=es`;

    let response: Response;
    try {
      response = await fetch(uri);
    } catch {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: 'Mapbox geocoding request failed.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.ok) {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: 'Mapbox returned a non-200 response.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = (await response.json()) as {
      features?: Array<{
        center?: [number, number];
        place_name?: string;
      }>;
    };

    const feature = body.features?.[0];
    if (!feature?.center) {
      throw new HttpException(
        { code: 'GEOCODE_NOT_FOUND', message: `No result found for: ${address}` },
        HttpStatus.NOT_FOUND,
      );
    }

    const [longitude, latitude] = feature.center;
    return {
      latitude,
      longitude,
      formattedAddress: feature.place_name ?? address,
    };
  }
}
