/**
 * Unit tests for PlacesService.geocode — iter-3 Mapbox geocode proxy.
 */

// ── Mocks (before imports) ────────────────────────────────────────────────────

jest.mock('../config/envs', () => ({
  envs: {
    googlePlacesApiKey: 'fake-google-key',
    mapboxAccessToken: 'pk.fake-mapbox-token',
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ── Imports ───────────────────────────────────────────────────────────────────

import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { PlacesService } from './places.service';

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
        features: [
          {
            center: [-74.0721, 4.7110],
            place_name: 'Bogotá, Colombia',
          },
        ],
      }),
    });

    const result = await service.geocode('Bogotá');

    expect(result).toEqual({
      latitude: 4.7110,
      longitude: -74.0721,
      formattedAddress: 'Bogotá, Colombia',
    });
  });

  it('TC-G-2: throws 404 when Mapbox returns empty features array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
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

  it('TC-G-4: throws 502 when Mapbox returns non-200', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(service.geocode('Cali')).rejects.toThrow(
      expect.objectContaining({ status: HttpStatus.BAD_GATEWAY }),
    );
  });

  it('TC-G-5: throws 503 when MAPBOX_ACCESS_TOKEN is not configured', async () => {
    // Use a fresh service instance with a mock that returns no token
    const { envs: mutableEnvs } = require('../config/envs') as { envs: Record<string, unknown> };
    const originalToken = mutableEnvs.mapboxAccessToken;
    mutableEnvs.mapboxAccessToken = undefined;

    await expect(service.geocode('Bogotá')).rejects.toThrow(
      expect.objectContaining({ status: HttpStatus.SERVICE_UNAVAILABLE }),
    );

    mutableEnvs.mapboxAccessToken = originalToken;
  });

  it('TC-G-6: URL includes encoded address and access_token param', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ center: [-75.5636, 6.2442], place_name: 'Medellín, Colombia' }],
      }),
    });

    await service.geocode('Medellín Colombia');

    const calledUrl: string = (mockFetch.mock.calls[0] as [string])[0];
    expect(calledUrl).toContain('Medell%C3%ADn%20Colombia');
    expect(calledUrl).toContain('access_token=pk.fake-mapbox-token');
    expect(calledUrl).toContain('language=es');
    expect(calledUrl).toContain('limit=1');
  });
});
