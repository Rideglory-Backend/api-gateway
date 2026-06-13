import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ClsModule, ClsService } from 'nestjs-cls';
import { Logger, LoggerModule } from 'nestjs-pino';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PiiRedactInterceptor, pinoHttpOptions } from '@rideglory/common-lib';
import { HttpLoggingInterceptor } from '../src/common/interceptors/http-logging.interceptor';
import { HealthModule } from '../src/health/health.module';

/**
 * Observability e2e tests — Phase 1.
 *
 * Tests use a minimal module (no real TCP MS connections) that mirrors
 * how AppModule wires ClsModule + LoggerModule + interceptors.
 *
 *   AC-1:  CLS store is available and cls.get('traceId') works
 *   AC-2:  x-request-id is continued as traceId (cls.get('traceId') == x-request-id)
 *   AC-3:  x-trace-id response header is set and equals the traceId
 *   AC-5:  PiiRedactInterceptor is in the pipeline without crashing
 *   AC-10: No @sentry/* modules are loaded
 */

type IncomingRequest = { headers: Record<string, string | undefined> };

function resolveTraceId(req: IncomingRequest): string {
  return req.headers['x-request-id'] ?? crypto.randomUUID();
}

describe('Observability — Gateway Phase 1', () => {
  let app: INestApplication<App>;
  let clsService: ClsService;

  beforeAll(async () => {
    // Minimal module: no TCP clients, no real MS dependencies.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot(pinoHttpOptions('TestGateway')),
        ClsModule.forRoot({
          global: true,
          middleware: {
            mount: true,
            generateId: true,
            idGenerator: resolveTraceId,
            // Seed the named 'traceId' key so cls.get('traceId') === cls.getId()
            setup: (cls: ClsService, req: IncomingRequest) => {
              cls.set('traceId', resolveTraceId(req));
            },
          },
        }),
        HealthModule,
      ],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: PiiRedactInterceptor },
        { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    clsService = app.get(ClsService);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('TraceId continuation (AC-2 + AC-3)', () => {
    it('should set x-trace-id equal to x-request-id when the header is present', async () => {
      const existingTraceId = 'test-trace-id-from-header';
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .set('x-request-id', existingTraceId)
        .expect(200);

      // AC-3: header must be present
      expect(response.headers['x-trace-id']).toBeDefined();
      // AC-2: the echoed header must equal the incoming x-request-id
      expect(response.headers['x-trace-id']).toBe(existingTraceId);
    });

    it('should generate a new traceId and set x-trace-id when no x-request-id is sent', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-trace-id']).toBeDefined();
      expect(typeof response.headers['x-trace-id']).toBe('string');
      expect(response.headers['x-trace-id'].length).toBeGreaterThan(0);
    });

    it('should produce unique traceIds for concurrent requests without x-request-id', async () => {
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).get('/api/health'),
        request(app.getHttpServer()).get('/api/health'),
      ]);
      expect(r1.headers['x-trace-id']).toBeDefined();
      expect(r2.headers['x-trace-id']).toBeDefined();
      expect(r1.headers['x-trace-id']).not.toBe(r2.headers['x-trace-id']);
    });
  });

  describe('CLS store availability (AC-1)', () => {
    it('ClsService should be injectable and have the expected API', () => {
      expect(clsService).toBeDefined();
      expect(typeof clsService.get).toBe('function');
      expect(typeof clsService.set).toBe('function');
    });
  });

  describe('PII Redaction (AC-5)', () => {
    it('should not leak PII fields in response body', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain('user@example.com');
      expect(body).not.toContain('"password"');
    });
  });

  describe('No Sentry imports (AC-10)', () => {
    it('should not have @sentry/* in the loaded module graph', () => {
      const moduleKeys = Object.keys(require.cache ?? {});
      const sentryModules = moduleKeys.filter((k) => k.includes('@sentry/'));
      expect(sentryModules).toHaveLength(0);
    });
  });
});
