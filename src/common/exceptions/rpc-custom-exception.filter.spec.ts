import { HttpException, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import * as Sentry from '@sentry/node';
import { RpcCustomExceptionFilter } from './rpc-custom-exception.filter';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

function buildMockResponse() {
  const headers: Record<string, string> = {};
  const body: { statusCode?: number; message?: unknown; traceId?: string } = {};

  return {
    setHeader: jest.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    status: jest.fn().mockReturnThis(),
    json: jest.fn((data: unknown) => {
      Object.assign(body, data);
    }),
    _headers: headers,
    _body: body,
  };
}

function buildHost(mockResponse: ReturnType<typeof buildMockResponse>) {
  return {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
    }),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function buildClsMock(traceId?: string) {
  return {
    get: jest.fn((key: string) => (key === 'traceId' ? traceId : undefined)),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('RpcCustomExceptionFilter', () => {
  const captureException = Sentry.captureException as jest.Mock;
  const loggerWarn = Sentry.logger.warn as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('5xx errors', () => {
    it('calls captureException with service tag for RpcException status 500', () => {
      const filter = new RpcCustomExceptionFilter(buildClsMock('trace-123'));
      const res = buildMockResponse();
      const exception = new RpcException({ status: 500, message: 'Server error' });

      filter.catch(exception, buildHost(res));

      expect(captureException).toHaveBeenCalledWith(exception, {
        tags: { service: 'api-gateway' },
        extra: { traceId: 'trace-123' },
      });
      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it('calls captureException for generic Error (unhandled)', () => {
      const filter = new RpcCustomExceptionFilter(buildClsMock());
      const res = buildMockResponse();
      const exception = new Error('Crash');

      filter.catch(exception, buildHost(res));

      expect(captureException).toHaveBeenCalledWith(exception, {
        tags: { service: 'api-gateway' },
        extra: { traceId: undefined },
      });
      expect(loggerWarn).not.toHaveBeenCalled();
    });

    it('preserves HTTP response shape { statusCode, message } for 500', () => {
      const filter = new RpcCustomExceptionFilter(buildClsMock());
      const res = buildMockResponse();
      const exception = new RpcException({ status: 500, message: 'Internal error' });

      filter.catch(exception, buildHost(res));

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500, message: 'Internal error' }),
      );
    });
  });

  describe('4xx errors', () => {
    it('calls Sentry.logger.warn for RpcException status 400', () => {
      const filter = new RpcCustomExceptionFilter(buildClsMock('trace-abc'));
      const res = buildMockResponse();
      const exception = new RpcException({ status: 400, message: 'Bad input' });

      filter.catch(exception, buildHost(res));

      expect(loggerWarn).toHaveBeenCalledWith('4xx gateway error', {
        service: 'api-gateway',
        status: 400,
        traceId: 'trace-abc',
        message: 'Bad input',
      });
      expect(captureException).not.toHaveBeenCalled();
    });

    it('calls Sentry.logger.warn for RpcException status 404', () => {
      const filter = new RpcCustomExceptionFilter(buildClsMock());
      const res = buildMockResponse();
      const exception = new RpcException({ status: 404, message: 'Not found' });

      filter.catch(exception, buildHost(res));

      expect(loggerWarn).toHaveBeenCalledWith('4xx gateway error', expect.objectContaining({
        service: 'api-gateway',
        status: 404,
      }));
      expect(captureException).not.toHaveBeenCalled();
    });

    it('preserves HTTP response shape { statusCode, message } for 400', () => {
      const filter = new RpcCustomExceptionFilter(buildClsMock());
      const res = buildMockResponse();
      const exception = new RpcException({ status: 400, message: 'Bad input' });

      filter.catch(exception, buildHost(res));

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'Bad input' }),
      );
    });

    it('includes traceId in response header and body when present', () => {
      const filter = new RpcCustomExceptionFilter(buildClsMock('trace-999'));
      const res = buildMockResponse();
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, buildHost(res));

      expect(res.setHeader).toHaveBeenCalledWith('x-trace-id', 'trace-999');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'trace-999' }),
      );
    });
  });

  describe('tag service:api-gateway', () => {
    it('always tags service as api-gateway for 5xx', () => {
      const filter = new RpcCustomExceptionFilter(buildClsMock());
      const res = buildMockResponse();
      const exception = new Error('crash');

      filter.catch(exception, buildHost(res));

      expect(captureException).toHaveBeenCalledWith(
        exception,
        expect.objectContaining({ tags: { service: 'api-gateway' } }),
      );
    });
  });
});
