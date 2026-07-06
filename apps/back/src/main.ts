import { NestFactory } from '@nestjs/core';
import { AppLoggerService } from '@lib/logger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@/core/filters/global-exception.filter';
import { ResponseInterceptor } from '@/core/interceptors/response.interceptor';
import * as bodyParser from 'body-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { getSwaggerConfig } from '@/core/config/swagger/swagger.config';
import { cors } from '@/core/config/cors/cors.config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import localizedFormat from 'dayjs/plugin/localizedFormat';
dayjs.extend(localizedFormat);
dayjs.locale('ru');

async function bootstrap() {
    // bufferLogs: логи до useLogger копятся и выводятся через @lib/logger.
    const app = await NestFactory.create(AppModule, {
        cors: cors,
        bufferLogs: true,
        snapshot: true,
    });

    // Централизованный логгер монорепо: метки app/env, уровни из env,
    // Telegram/ClickHouse-транспорты (LoggerModule.forRoot в AppModule).
    app.useLogger(app.get(AppLoggerService));
    app.flushLogs();
    app.enableShutdownHooks();

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: false,
            forbidUnknownValues: false,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
            // skipMissingProperties: true, // Пропускать валидацию для undefined полей
        }),
        // new ValidationPipe({
        //   whitelist: true,
        //   forbidNonWhitelisted: false,
        //   forbidUnknownValues: true,
        //   transform: true,
        //   transformOptions: { enableImplicitConversion: true },
        //   exceptionFactory: (errors) => {
        //     const validationErrors = errors.map((e) => ({
        //       property: e.property,
        //       constraints: e.constraints,
        //       children: e.children?.map((c) => ({
        //         property: c.property,
        //         constraints: c.constraints,
        //         children: c.children,
        //       })),
        //     }));

        //     console.error('[Validation Error]', validationErrors);

        //     return new BadRequestException({
        //       message: 'Validation failed',
        //       errors: validationErrors
        //     });
        //   },
        // }),
    );

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

    //documentation
    getSwaggerConfig(app);

    app.use(cookieParser());

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch(console.error);
