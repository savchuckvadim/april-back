import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    DocumentBuilder,
    SwaggerDocumentOptions,
    SwaggerModule,
} from '@nestjs/swagger';

/**
 * Настройка Swagger для приложения kpi-report-sales.
 * Параметры берутся из переменных окружения (с дефолтами),
 * чтобы у каждого приложения монорепозитория была своя документация.
 */
export const setupSwagger = (app: INestApplication): string => {
    const config = app.get(ConfigService);

    const title = config.get<string>('SWAGGER_TITLE') ?? 'KPI Report Sales API';
    const description =
        config.get<string>('SWAGGER_DESCRIPTION') ??
        'API сервиса отчётов KPI отдела продаж';
    const version = config.get<string>('SWAGGER_VERSION') ?? '1.0';
    const path = config.get<string>('SWAGGER_PATH') ?? 'docs/api';

    const documentConfig = new DocumentBuilder()
        .setTitle(title)
        .setDescription(description)
        .setVersion(version)
        .addTag('kpi-report-sales')
        .build();

    const options: SwaggerDocumentOptions = {
        operationIdFactory: (controllerKey: string, methodKey: string) => {
            const cleanController = controllerKey.replace(/Controller$/i, '');
            return `${cleanController}_${methodKey}`;
        },
    };

    const documentFactory = () =>
        SwaggerModule.createDocument(app, documentConfig, options);

    SwaggerModule.setup(path, app, documentFactory);

    return path;
};
