import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

@Catch()
export class RpcCustomExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const context = host.switchToHttp();
        const response = context.getResponse();
        const normalized = this.normalizeError(exception);

        return response.status(normalized.status).json({
            statusCode: normalized.status,
            message: normalized.message,
        });
    }

    private normalizeError(exception: unknown): { status: number; message: unknown } {
        if (exception instanceof RpcException) {
            const rpcError = exception.getError();

            if (
                typeof rpcError === 'object' &&
                rpcError !== null &&
                'status' in rpcError &&
                'message' in rpcError
            ) {
                return {
                    status: Number((rpcError as { status: number }).status),
                    message: (rpcError as { message: unknown }).message,
                };
            }

            return {
                status: HttpStatus.BAD_REQUEST,
                message: rpcError,
            };
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
}