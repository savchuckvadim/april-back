
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: 'http://localhost:5000',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

      credentials: true,
    }
  });
  app.setGlobalPrefix('api');

  // глобально подключаем interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
  // app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
