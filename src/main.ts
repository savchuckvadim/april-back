// Prisma отдаёт id-поля как BigInt, а JSON.stringify (express res.json, отправка в TG)
// не умеет их сериализовать → "Do not know how to serialize a BigInt". Глобально учим
// BigInt отдавать себя строкой (строка, а не number — чтобы не терять точность на
// значениях больше Number.MAX_SAFE_INTEGER). Лишнего обхода не добавляет: toJSON
// вызывается для каждого bigint в рамках обычного прохода JSON.stringify.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
    this: bigint,
): string {
    return this.toString();
};

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import * as bodyParser from 'body-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { getSwaggerConfig } from './core/config/swagger/swagger.config';
import { cors } from './core/config/cors/cors.config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import localizedFormat from 'dayjs/plugin/localizedFormat';
dayjs.extend(localizedFormat);
dayjs.locale('ru');

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

    app.useLogger(['error', 'warn', 'log', 'debug', 'verbose']);
    app.use(cookieParser());

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch(console.error);
