import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { throwError } from 'rxjs';

@Catch(RpcException)
export class RpcCustomExceptionFilter implements ExceptionFilter {

    catch(exception: RpcException, host: ArgumentsHost) {
        const context = host.switchToHttp();
        const response = context.getResponse();

        const rpcError = exception.getError();

        if (typeof rpcError === 'object' && 'message' in rpcError && 'status' in rpcError) {
            const status = rpcError.status;

            return response.status(status).json(rpcError);
        }

        return response.status(HttpStatus.BAD_REQUEST).json({
            statusCode: HttpStatus.BAD_REQUEST,
            message: rpcError,
        });
    }
}