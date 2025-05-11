// src/metrics/metrics.module.ts
import { Module } from '@nestjs/common';
import { PrometheusModule, makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from '../interceptors/metrics.interceptor';

@Module({
  imports: [   PrometheusModule.register({
    defaultMetrics: {
      enabled: true, // или false, если не хочешь стандартные метрики
    },
  }),],
  providers: [
    MetricsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'url', 'status'],
    }),
    makeCounterProvider({
      name: 'http_requests_errors_total',
      help: 'Total number of failed HTTP requests',
      labelNames: ['method', 'url'],
    }),
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'url'],
      buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    }),
  ],
  exports: [],
})
export class MetricsModule {}
