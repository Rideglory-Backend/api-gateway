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

// Matches "lng,lat" format sent by the pick-mode reverse geocode call.
const COORDINATE_RE = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/;

const MAPBOX_GEOCODING_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const GOOGLE_PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

@Injectable()
export class PlacesService {
  async autocomplete(query: string, type: PlaceType): Promise<PlaceSuggestion[]> {
    if (type === 'establishment') {
      return this.autocompleteWithGoogle(query);
    }
    // Cities: local dataset, no external API needed.
    return searchCities(query.trim()).map((name) => ({
      name,
      placeId: null,
      latitude: null,
      longitude: null,
    }));
  }

  // Google Places Autocomplete — mejor cobertura de POIs y comercios en Colombia.
  private async autocompleteWithGoogle(query: string): Promise<PlaceSuggestion[]> {
    const key = envs.googlePlacesApiKey;
    if (!key) return [];

    const params = new URLSearchParams({
      input: query,
      key,
      language: 'es',
      components: 'country:co',
      types: 'establishment',
    });

    let response: Response;
    try {
      response = await fetch(`${GOOGLE_PLACES_BASE}/autocomplete/json?${params}`);
    } catch {
      return [];
    }

    if (!response.ok) return [];

    const body = (await response.json()) as {
      status?: string;
      predictions?: Array<{
        place_id?: string;
        description?: string;
        structured_formatting?: { main_text?: string };
      }>;
    };

    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') return [];

    return (body.predictions ?? [])
      .map((p) => ({
        // Las coordenadas se obtienen en getDetails() — Google Autocomplete no las incluye.
        name: p.description ?? p.structured_formatting?.main_text ?? '',
        placeId: p.place_id ?? null,
        latitude: null,
        longitude: null,
      }))
      .filter((s) => Boolean(s.name));
  }

  // Google Places Details — devuelve coordenadas exactas a partir del place_id.
  async getDetails(placeId: string): Promise<GeocodeResult> {
    const key = envs.googlePlacesApiKey;
    if (!key) {
      throw new HttpException(
        { code: 'GEOCODE_API_NOT_CONFIGURED', message: 'Google Places API key is not configured.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const params = new URLSearchParams({
      place_id: placeId,
      key,
      language: 'es',
      fields: 'geometry,formatted_address,name',
    });

    let response: Response;
    try {
      response = await fetch(`${GOOGLE_PLACES_BASE}/details/json?${params}`);
    } catch {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: 'Google Places Details request failed.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.ok) {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: `Google Places Details returned status ${response.status}.` },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const body = (await response.json()) as {
      status?: string;
      result?: {
        geometry?: { location?: { lat?: number; lng?: number } };
        formatted_address?: string;
        name?: string;
      };
    };

    if (body.status !== 'OK' || !body.result?.geometry?.location) {
      throw new HttpException(
        { code: 'GEOCODE_NOT_FOUND', message: `No result found for place_id: ${placeId}` },
        HttpStatus.NOT_FOUND,
      );
    }

    const loc = body.result.geometry.location;
    return {
      latitude: loc.lat!,
      longitude: loc.lng!,
      formattedAddress: body.result.formatted_address ?? body.result.name ?? placeId,
    };
  }

  async geocode(address: string): Promise<GeocodeResult> {
    const coordMatch = address.match(COORDINATE_RE);
    if (coordMatch) {
      const lng = parseFloat(coordMatch[1]);
      const lat = parseFloat(coordMatch[2]);
      return this.reverseGeocode(lng, lat);
    }
    return this.forwardGeocode(address);
  }

  private async forwardGeocode(address: string): Promise<GeocodeResult> {
    const token = envs.mapboxAccessToken;
    if (!token) {
      throw new HttpException(
        { code: 'GEOCODE_API_NOT_CONFIGURED', message: 'Mapbox access token is not configured.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const encoded = encodeURIComponent(address);
    const uri = `${MAPBOX_GEOCODING_BASE}/${encoded}.json?access_token=${token}&limit=1&language=es&country=co`;
    return this.parseMapboxGeocodeResponse(uri, address);
  }

  private async reverseGeocode(lng: number, lat: number): Promise<GeocodeResult> {
    const token = envs.mapboxAccessToken;
    if (!token) {
      throw new HttpException(
        { code: 'GEOCODE_API_NOT_CONFIGURED', message: 'Mapbox access token is not configured.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Mapbox Geocoding v5 reverse geocode: siempre retorna al menos una feature
    // (país/región/ciudad) — nunca ZERO_RESULTS como Google.
    const uri =
      `${MAPBOX_GEOCODING_BASE}/${lng},${lat}.json` +
      `?access_token=${token}&limit=1&language=es&types=address,poi,locality,place,district,region`;
    return this.parseMapboxGeocodeResponse(uri, `${lng},${lat}`);
  }

  private async parseMapboxGeocodeResponse(uri: string, originalQuery: string): Promise<GeocodeResult> {
    let response: Response;
    try {
      response = await fetch(uri);
    } catch {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: 'Mapbox Geocoding request failed.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.ok) {
      throw new HttpException(
        { code: 'GEOCODE_UPSTREAM_ERROR', message: `Mapbox Geocoding returned status ${response.status}.` },
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
        { code: 'GEOCODE_NOT_FOUND', message: `No result found for: ${originalQuery}` },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      longitude: feature.center[0],
      latitude: feature.center[1],
      formattedAddress: feature.place_name ?? originalQuery,
    };
  }
}
