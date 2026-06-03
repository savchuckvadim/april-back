import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@/core/filters/global-exception.filter';
import { ResponseInterceptor } from '@/core/interceptors/response.interceptor';
import { getSwaggerConfig } from '@/core/config/swagger/swagger.config';
import { cors } from '@/core/config/cors/cors.config';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        cors: cors,
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: false,
            forbidUnknownValues: false,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    app.setGlobalPrefix('api');

    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(app.get(GlobalExceptionFilter));

    app.use(bodyParser.json({ limit: '150mb' }));
    app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

    getSwaggerConfig(app);

    await app.listen(process.env.PORT ?? 3001);
}
bootstrap().catch(console.error);
