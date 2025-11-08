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
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        cors: cors,
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
        snapshot: true,
        // logger: WinstonModule.createLogger({ instance: winstonLogger }),
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: false,
            forbidUnknownValues: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
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


    app.useLogger(['error', 'warn', 'log', 'debug', 'verbose']);
    app.use(cookieParser());

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
