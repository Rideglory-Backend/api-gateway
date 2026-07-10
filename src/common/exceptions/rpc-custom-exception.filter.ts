import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import * as Sentry from '@sentry/node';
import { ClsService } from 'nestjs-cls';

@Catch()
export class RpcCustomExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcCustomExceptionFilter.name);

  constructor(private readonly cls?: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const normalized = this.normalizeError(exception);
    const traceId: string | undefined = this.cls?.get?.('traceId');

    if (normalized.status >= 500) {
      this.logger.error(exception);
      Sentry.captureException(exception, {
        tags: { service: 'api-gateway' },
        extra: { traceId },
      });
    } else {
      Sentry.logger.warn('4xx gateway error', {
        service: 'api-gateway',
        status: normalized.status,
        traceId,
        message: normalized.message,
      });
    }

    if (traceId) {
      response.setHeader('x-trace-id', traceId);
    }

    return response.status(normalized.status).json({
      statusCode: normalized.status,
      message: normalized.message,
      ...normalized.extra,
      ...(traceId ? { traceId } : {}),
    });
  }

  private normalizeError(exception: unknown): {
    status: number;
    message: unknown;
    extra?: Record<string, unknown>;
  } {
    if (exception instanceof RpcException) {
      const rpcError = exception.getError();

      if (
        typeof rpcError === 'object' &&
        rpcError !== null &&
        'status' in rpcError &&
        'message' in rpcError
      ) {
        // Cualquier propiedad adicional del error (p. ej. `error`,
        // `activeEvents`) se preserva en el body de la respuesta HTTP —
        // no solo `statusCode`/`message`. Ver ACTIVE_EVENTS_AS_ORGANIZER.
        const { status, message, ...extra } = rpcError as {
          status: number;
          message: unknown;
          [key: string]: unknown;
        };

        return {
          status: Number(status),
          message,
          extra: Object.keys(extra).length > 0 ? extra : undefined,
        };
      }

      return {
        status: HttpStatus.BAD_REQUEST,
        message: rpcError,
      };
    }

    if (exception instanceof HttpException) {
      return this.normalizeHttpResponse(
        exception.getStatus(),
        exception.getResponse(),
      );
    }

    if (
      typeof exception === 'object' &&
      exception !== null &&
      'response' in exception
    ) {
      const response = exception.response;
      const status =
        'status' in exception
          ? Number((exception as { status: number }).status)
          : HttpStatus.INTERNAL_SERVER_ERROR;

      return this.normalizeHttpResponse(status, response);
    }

    if (
      typeof exception === 'object' &&
      exception !== null &&
      'status' in exception &&
      'message' in exception
    ) {
      return {
        status: Number((exception as { status: number }).status),
        message: (exception as { message: unknown }).message,
      };
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  private normalizeHttpResponse(
    status: number,
    errorResponse: unknown,
  ): { status: number; message: unknown } {
    if (typeof errorResponse === 'string') {
      return { status, message: errorResponse };
    }

    if (typeof errorResponse === 'object' && errorResponse !== null) {
      const response = errorResponse as {
        statusCode?: number;
        message?: unknown;
        error?: unknown;
      };

      return {
        status: response.statusCode ?? status,
        message: response.message ?? response.error ?? 'Internal server error',
      };
    }

    return {
      status,
      message: 'Internal server error',
    };
  }
}
