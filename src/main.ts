
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import * as bodyParser from 'body-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { getSwaggerConfig } from './core/config/swagger/swagger.config';
import { cors } from './core/config/cors/cors.config';
import { winstonLogger } from './core/config/logs/logger';
import { WinstonModule } from 'nest-winston';


async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: cors,
    snapshot: true,
    logger: WinstonModule.createLogger({ instance: winstonLogger })
  });
  app.setGlobalPrefix('api');

  // глобально подключаем interceptor
  app.useGlobalInterceptors(
    new ResponseInterceptor(),

  );
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
  // app.enableCors();

  // Увеличиваем лимит тела запроса (например, до 50MB)
  app.use(bodyParser.json({ limit: '150mb' }));
  app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));


  //ws
  app.useWebSocketAdapter(new IoAdapter(app));


  //documentation
  getSwaggerConfig(app)
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
