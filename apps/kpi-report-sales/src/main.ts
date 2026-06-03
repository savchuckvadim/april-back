import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import localizedFormat from 'dayjs/plugin/localizedFormat';

import { KpiReportSalesModule } from './kpi-report-sales.module';
import { GlobalExceptionFilter } from '@/core/filters/global-exception.filter';
import { ResponseInterceptor } from '@/core/interceptors/response.interceptor';
import { cors } from '@/core/config/cors/cors.config';
import { setupSwagger } from './config/swagger.config';

dayjs.extend(localizedFormat);
dayjs.locale('ru');

async function bootstrap() {
    const app = await NestFactory.create(KpiReportSalesModule, {
        cors: cors,
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
        snapshot: true,
    });

    const config = app.get(ConfigService);
    const port = Number(config.get<string>('PORT')) || 3001;
    const globalPrefix = config.get<string>('GLOBAL_PREFIX') ?? 'api';

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
    app.useGlobalFilters(app.get(GlobalExceptionFilter));

    app.use(bodyParser.json({ limit: '150mb' }));
    app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));
    app.use(cookieParser());

    const swaggerPath = setupSwagger(app);

    await app.listen(port);
    const url = await app.getUrl();

    console.log(
        `🚀 kpi-report-sales запущен: ${url}/${globalPrefix} | Swagger: ${url}/${swaggerPath}`,
    );
}
bootstrap().catch(console.error);
