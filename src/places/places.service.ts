import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { envs } from '../config/envs';
import { searchCities } from './colombia-cities.data';

type PlaceType = 'cities' | 'establishment';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export interface PlaceSuggestion {
  name: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
}

// Matches "lng,lat" format sent by MapLocationPickerModal (e.g. "-74.0721,4.7110")
const COORDINATE_RE = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/;

@Injectable()
export class PlacesService {
  async autocomplete(query: string, type: PlaceType): Promise<PlaceSuggestion[]> {
    if (type === 'establishment') {
      return this.autocompleteEstablishment(query);
    }
    // Cities: local dataset, no external API needed
    return searchCities(query.trim()).map((name) => ({
      name,
      placeId: null,
      latitude: null,
      longitude: null,
    }));
  }

  private async autocompleteEstablishment(query: string): Promise<PlaceSuggestion[]> {
    const apiKey = envs.googlePlacesApiKey;
    if (!apiKey) return [];

    const encoded = encodeURIComponent(query);
    const uri = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encoded}&key=${apiKey}&language=es&components=country:co&types=establishment`;

    let response: Response;
    try {
      response = await fetch(uri);
    } catch {
      return [];
    }

    if (!response.ok) return [];

    const body = (await response.json()) as {
      status?: string;
      predictions?: Array<{ description?: string; place_id?: string }>;
    };

    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') return [];

    return (body.predictions ?? [])
      .slice(0, 5)
      .map((p) => ({
        name: p.description ?? '',
        placeId: p.place_id ?? null,
        latitude: null,
        longitude: null,
      }))
      .filter((s) => Boolean(s.name));
  }

  async getDetails(placeId: string): Promise<GeocodeResult> {
    const apiKey = envs.googlePlacesApiKey;
    if (!apiKey) {
      throw new HttpException(
        { code: 'GEOCODE_API_NOT_CONFIGURED', message: 'Google Places API key is not configured.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const uri = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,formatted_address&key=${apiKey}&language=es`;

    let response: Response;
    try {
      response = await fetch(uri);
    } catch {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: 'Google Places Details request failed.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.ok) {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: 'Google Places Details returned a non-200 response.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = (await response.json()) as {
      status?: string;
      result?: {
        geometry?: { location?: { lat?: number; lng?: number } };
        formatted_address?: string;
      };
    };

    if (body.status !== 'OK' || !body.result) {
      throw new HttpException(
        { code: 'GEOCODE_NOT_FOUND', message: `No result found for place_id: ${placeId}` },
        HttpStatus.NOT_FOUND,
      );
    }

    const lat = body.result.geometry?.location?.lat;
    const lng = body.result.geometry?.location?.lng;

    if (lat == null || lng == null) {
      throw new HttpException(
        { code: 'GEOCODE_NOT_FOUND', message: `No coordinates found for place_id: ${placeId}` },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      latitude: lat,
      longitude: lng,
      formattedAddress: body.result.formatted_address ?? placeId,
    };
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const coordMatch = address.match(COORDINATE_RE);
    if (coordMatch) {
      const lng = parseFloat(coordMatch[1]);
      const lat = parseFloat(coordMatch[2]);
      return this.reverseGeocodeWithGoogle(lat, lng);
    }
    return this.forwardGeocodeWithGoogle(address);
  }

  private async forwardGeocodeWithGoogle(address: string): Promise<GeocodeResult> {
    const apiKey = envs.googlePlacesApiKey;
    if (!apiKey) {
      throw new HttpException(
        { code: 'GEOCODE_API_NOT_CONFIGURED', message: 'Google Places API key is not configured.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const encoded = encodeURIComponent(address);
    const uri = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}&language=es&region=co`;
    return this.parseGoogleGeocodeResponse(uri, address);
  }

  private async reverseGeocodeWithGoogle(lat: number, lng: number): Promise<GeocodeResult> {
    const apiKey = envs.googlePlacesApiKey;
    if (!apiKey) {
      throw new HttpException(
        { code: 'GEOCODE_API_NOT_CONFIGURED', message: 'Google Places API key is not configured.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const uri = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es`;
    return this.parseGoogleGeocodeResponse(uri, `${lng},${lat}`);
  }

  private async parseGoogleGeocodeResponse(
    uri: string,
    originalQuery: string,
  ): Promise<GeocodeResult> {
    let response: Response;
    try {
      response = await fetch(uri);
    } catch {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: 'Google Geocoding request failed.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.ok) {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: 'Google Geocoding returned a non-200 response.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = (await response.json()) as {
      status?: string;
      results?: Array<{
        geometry?: { location?: { lat?: number; lng?: number } };
        formatted_address?: string;
      }>;
    };

    if (body.status !== 'OK' || !body.results?.length) {
      throw new HttpException(
        { code: 'GEOCODE_NOT_FOUND', message: `No result found for: ${originalQuery}` },
        HttpStatus.NOT_FOUND,
      );
    }

    const result = body.results[0];
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;

    if (lat == null || lng == null) {
      throw new HttpException(
        { code: 'GEOCODE_NOT_FOUND', message: `No coordinates found for: ${originalQuery}` },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      latitude: lat,
      longitude: lng,
      formattedAddress: result.formatted_address ?? originalQuery,
    };
  }
}
