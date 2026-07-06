import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
    makeCounterProvider,
    makeHistogramProvider,
    PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import {
    HTTP_REQUEST_DURATION_SECONDS,
    HTTP_REQUESTS_ERRORS_TOTAL,
    HTTP_REQUESTS_TOTAL,
} from './metrics.constants';

export interface MetricsModuleOptions {
    /** Имя приложения — метка `app` на всех метриках (как в @lib/logger). */
    appName: string;
}

/**
 * Метрики приложения для Prometheus.
 *
 * Подключение (один раз в корневом модуле):
 * ```ts
 * imports: [MetricsModule.forRoot({ appName: 'admin' })]
 * ```
 *
 * Даёт:
 * - GET /api/metrics (открыт @Public — доступен Prometheus'у при включённой авторизации);
 * - системные метрики Node (heap, event loop, CPU) — defaultMetrics prom-client;
 * - HTTP-метрики через глобальный {@link MetricsInterceptor}:
 *   http_requests_total{method,route,status}, http_requests_errors_total{method,route},
 *   http_request_duration_seconds{method,route};
 * - метки app/env на каждой метрике (defaultLabels).
 *
 * Свои метрики в приложении: makeCounterProvider(...) в providers своего
 * модуля + @InjectMetric('имя') в сервисе — регистр prom-client общий.
 */
@Module({})
export class MetricsModule {
    static forRoot(options: MetricsModuleOptions): DynamicModule {
        return {
            module: MetricsModule,
            imports: [
                PrometheusModule.register({
                    controller: MetricsController,
                    defaultMetrics: { enabled: true },
                    defaultLabels: {
                        app: options.appName,
                        env: process.env.NODE_ENV ?? 'development',
                    },
                }),
            ],
            providers: [
                { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
                makeCounterProvider({
                    name: HTTP_REQUESTS_TOTAL,
                    help: 'Total number of HTTP requests',
                    labelNames: ['method', 'route', 'status'],
                }),
                makeCounterProvider({
                    name: HTTP_REQUESTS_ERRORS_TOTAL,
                    help: 'Total number of failed HTTP requests',
                    labelNames: ['method', 'route'],
                }),
                makeHistogramProvider({
                    name: HTTP_REQUEST_DURATION_SECONDS,
                    help: 'Duration of HTTP requests in seconds',
                    labelNames: ['method', 'route'],
                    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
                }),
            ],
        };
    }
}
