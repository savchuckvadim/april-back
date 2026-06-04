import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
    DocumentBuilder,
    SwaggerDocumentOptions,
    SwaggerModule,
} from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { ResponseInterceptor } from '../interceptors/response.interceptor';
import { cors } from '../config/cors/cors.config';

export interface BootstrapOptions {
    /** Имя приложения — для Swagger-заголовка/тега и логов. */
    name: string;
    /** Порт по умолчанию, если не задан process.env.PORT. */
    defaultPort: number;
    /** Глобальный префикс маршрутов. По умолчанию 'api'. */
    globalPrefix?: string;
    /** Путь Swagger UI. По умолчанию 'docs/api'. */
    swaggerPath?: string;
    /** Лимит тела запроса. По умолчанию '150mb'. */
    bodyLimit?: string;
    /**
     * Хук для специфичной настройки app (cookieParser, WS-адаптер и т.п.)
     * — вызывается после стандартной настройки, перед listen().
     */
    configure?: (app: INestApplication) => void | Promise<void>;
}

/**
 * Единый bootstrap для всех приложений монорепо: ValidationPipe, глобальный
 * префикс, ResponseInterceptor, GlobalExceptionFilter, лимиты тела, Swagger, CORS.
 * Порт читается из process.env.PORT (фолбэк — options.defaultPort).
 *
 * Использование в apps/<app>/src/main.ts:
 *   bootstrapApp(AppModule, { name: '<app>', defaultPort: 30NN });
 */
export async function bootstrapApp(
    rootModule: Parameters<typeof NestFactory.create>[0],
    options: BootstrapOptions,
): Promise<INestApplication> {
    const app = await NestFactory.create(rootModule, {
        cors,
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    // Приоритет: явный options -> переменная окружения (apps/<app>/.env / compose)
    // -> дефолт. Так per-app .env реально управляет префиксом/Swagger без дублей.
    const globalPrefix =
        options.globalPrefix ?? process.env.GLOBAL_PREFIX ?? 'api';
    const bodyLimit = options.bodyLimit ?? process.env.BODY_LIMIT ?? '150mb';
    const swaggerPath =
        options.swaggerPath ?? process.env.SWAGGER_PATH ?? 'docs/api';

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: false,
            forbidUnknownValues: false,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    app.setGlobalPrefix(globalPrefix);
    app.useGlobalInterceptors(new ResponseInterceptor());

    // Фильтр создаём напрямую, БЕЗ app.get(): NestFactory.create по умолчанию
    // abortOnError:true и оборачивает app в ExceptionsZone-proxy — если бы фильтр
    // не был зарегистрирован в DI, app.get() убил бы процесс ещё до нашего catch.
    // Единственная зависимость фильтра (TelegramService) @Optional, а standalone-
    // приложения Telegram не подключают, поэтому new эквивалентен DI-инстансу.
    app.useGlobalFilters(new GlobalExceptionFilter());

    app.use(bodyParser.json({ limit: bodyLimit }));
    app.use(bodyParser.urlencoded({ limit: bodyLimit, extended: true }));

    const documentConfig = new DocumentBuilder()
        .setTitle(process.env.SWAGGER_TITLE ?? `${options.name} API`)
        .setDescription(
            process.env.SWAGGER_DESCRIPTION ?? `API приложения ${options.name}`,
        )
        .setVersion(process.env.SWAGGER_VERSION ?? '1.0')
        .addTag(options.name)
        .build();
    const documentOptions: SwaggerDocumentOptions = {
        operationIdFactory: (controllerKey: string, methodKey: string) =>
            `${controllerKey.replace(/Controller$/i, '')}_${methodKey}`,
    };
    SwaggerModule.setup(swaggerPath, app, () =>
        SwaggerModule.createDocument(app, documentConfig, documentOptions),
    );

    if (options.configure) {
        await options.configure(app);
    }

    const port = Number(process.env.PORT) || options.defaultPort;
    await app.listen(port);

    const url = await app.getUrl();

    console.log(
        `🚀 ${options.name} запущен: ${url}/${globalPrefix} | Swagger: ${url}/${swaggerPath}`,
    );
    return app;
}
