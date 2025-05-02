
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import * as bodyParser from 'body-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
const cors = {
  origin: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map(origin => origin.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

  credentials: true,
}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors,
    snapshot: true,
  });
  app.setGlobalPrefix('api');

  // глобально подключаем interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
  // app.enableCors();

  // Увеличиваем лимит тела запроса (например, до 50MB)
  app.use(bodyParser.json({ limit: '150mb' }));
  app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));


  //ws
  app.useWebSocketAdapter(new IoAdapter(app));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
