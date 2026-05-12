import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envs } from './config/envs';
import { RpcCustomExceptionFilter } from './common/exceptions/rpc-custom-exception.filter';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const logger = new Logger('ApiGateway');

  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
  }));

  app.useGlobalFilters(new RpcCustomExceptionFilter());

  // Bind to all interfaces. Required in containerized prod runtimes (Docker,
  // K8s, ECS, Cloud Run, …) and also lets emulators / physical devices on the
  // same LAN reach the gateway during local development. Public exposure must
  // still be controlled by the deployment's firewall / ingress.
  await app.listen(envs.port, '0.0.0.0');

  logger.log(`ApiGateway is running on port ${envs.port}`);
}
bootstrap();
