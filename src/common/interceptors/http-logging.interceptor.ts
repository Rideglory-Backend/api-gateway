import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Gateway HTTP request/response interceptor.
 * Emits method, url, status, latency, and traceId per request (AC-9).
 * Also sets the x-trace-id response header.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: Logger,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse<Response>();
        const traceId: string | undefined = this.cls.get('traceId');
        if (traceId) {
          res.setHeader('x-trace-id', traceId);
        }
        this.logger.log({
          method,
          url,
          status: res.statusCode,
          ms: Date.now() - start,
          traceId,
        });
      }),
    );
  }
}
