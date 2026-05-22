/**
 * Unit tests for PlacesService — Google Places geocode and autocomplete.
 */

// ── Mocks (before imports) ────────────────────────────────────────────────────

jest.mock('../config/envs', () => ({
  envs: {
    googlePlacesApiKey: 'fake-google-key',
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Imports ───────────────────────────────────────────────────────────────────

import { HttpStatus } from '@nestjs/common';
import { PlacesService } from './places.service';

// ── Geocode ───────────────────────────────────────────────────────────────────

describe('PlacesService — geocode', () => {
  let service: PlacesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlacesService();
  });

  it('TC-G-1: returns lat/lon/formattedAddress for valid address', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: { location: { lat: 4.711, lng: -74.0721 } },
            formatted_address: 'Bogotá, Colombia',
          },
        ],
      }),
    });

    const result = await service.geocode('Bogotá');

    expect(result).toEqual({
      latitude: 4.711,
      longitude: -74.0721,
      formattedAddress: 'Bogotá, Colombia',
    });
  });

  it('TC-G-2: throws 404 when Google returns ZERO_RESULTS', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
    });

    await expect(service.geocode('lugar-que-no-existe')).rejects.toThrow(
      expect.objectContaining({ status: HttpStatus.NOT_FOUND }),
    );
  });

  it('TC-G-3: throws 502 when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(service.geocode('Medellín')).rejects.toThrow(
      expect.objectContaining({ status: HttpStatus.BAD_GATEWAY }),
    );
  });

  it('TC-G-4: throws 502 when Google returns non-200', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(service.geocode('Cali')).rejects.toThrow(
      expect.objectContaining({ status: HttpStatus.BAD_GATEWAY }),
    );
  });

  it('TC-G-5: throws 503 when GOOGLE_PLACES_API_KEY is not configured', async () => {
    const { envs: mutableEnvs } = require('../config/envs') as { envs: Record<string, unknown> };
    const originalKey = mutableEnvs.googlePlacesApiKey;
    mutableEnvs.googlePlacesApiKey = undefined;

    await expect(service.geocode('Bogotá')).rejects.toThrow(
      expect.objectContaining({ status: HttpStatus.SERVICE_UNAVAILABLE }),
    );

    mutableEnvs.googlePlacesApiKey = originalKey;
  });

  it('TC-G-6: URL includes encoded address and API key param', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: { location: { lat: 6.2442, lng: -75.5636 } },
            formatted_address: 'Medellín, Colombia',
          },
        ],
      }),
    });

    await service.geocode('Medellín Colombia');

    const calledUrl: string = (mockFetch.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain('Medell%C3%ADn%20Colombia');
    expect(calledUrl).toContain('key=fake-google-key');
    expect(calledUrl).toContain('language=es');
  });

  it('TC-G-7: reverse geocodes "lng,lat" coordinate strings', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: { location: { lat: 4.711, lng: -74.0721 } },
            formatted_address: 'Bogotá, Colombia',
          },
        ],
      }),
    });

    const result = await service.geocode('-74.0721,4.711');

    const calledUrl: string = (mockFetch.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain('latlng=4.711,-74.0721');
    expect(result.latitude).toBe(4.711);
    expect(result.longitude).toBe(-74.0721);
  });
});

// ── Autocomplete — establishment ──────────────────────────────────────────────

describe('PlacesService — autocomplete (establishment)', () => {
  let service: PlacesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlacesService();
  });

  it('TC-A-1: returns up to 5 suggestions from Google Places Autocomplete', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        predictions: Array.from({ length: 8 }, (_, i) => ({
          description: `Lugar ${i + 1}, Bogotá, Colombia`,
          place_id: `place_id_${i + 1}`,
        })),
      }),
    });

    const results = await service.autocomplete('restaurante', 'establishment');

    expect(results).toHaveLength(5);
    expect(results[0]).toMatchObject({
      name: 'Lugar 1, Bogotá, Colombia',
      latitude: null,
      longitude: null,
    });
  });

  it('TC-A-2: returns empty array when Google Places API key is not configured', async () => {
    const { envs: mutableEnvs } = require('../config/envs') as { envs: Record<string, unknown> };
    const originalKey = mutableEnvs.googlePlacesApiKey;
    mutableEnvs.googlePlacesApiKey = undefined;

    const results = await service.autocomplete('café', 'establishment');

    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();

    mutableEnvs.googlePlacesApiKey = originalKey;
  });

  it('TC-A-3: returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const results = await service.autocomplete('tienda', 'establishment');

    expect(results).toEqual([]);
  });

  it('TC-A-4: returns empty array when Google returns non-200', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const results = await service.autocomplete('hotel', 'establishment');

    expect(results).toEqual([]);
  });

  it('TC-A-5: URL includes encoded query, API key, and establishment type', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'OK', predictions: [] }),
    });

    await service.autocomplete('Café Bóveda', 'establishment');

    const calledUrl: string = (mockFetch.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain('Caf%C3%A9%20B%C3%B3veda');
    expect(calledUrl).toContain('key=fake-google-key');
    expect(calledUrl).toContain('language=es');
    expect(calledUrl).toContain('types=establishment');
  });
});
