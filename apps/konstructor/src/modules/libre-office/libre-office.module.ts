import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    makeCounterProvider,
    makeGaugeProvider,
    makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { LibreOfficeService } from './libre-office.service';
import {
    LIBRE_OFFICE_CONFIG,
    buildLibreOfficeConfig,
} from './config/libre-office.config';
import {
    LIBREOFFICE_CONVERSION_DURATION_SECONDS,
    LIBREOFFICE_CONVERSION_ERRORS_TOTAL,
    LIBREOFFICE_DURATION_BUCKETS,
    LIBREOFFICE_POOL_SLOTS,
} from './config/libre-office.metrics';
import { LibreOfficeEndpointPool } from './services/libre-office-endpoint-pool.service';
import { LibreOfficeEndpointResolver } from './services/libre-office-endpoint-resolver.service';
import { LibreOfficeHttpConverter } from './services/libre-office-http.converter';
import { LibreOfficeExecConverter } from './services/libre-office-exec.converter';
import { LibreOfficeMetricsService } from './services/libre-office-metrics.service';

@Module({
    providers: [
        {
            // Конфиг читается один раз на старте: пул создаётся по нему в
            // конструкторе и должен быть стабильным на всё время жизни модуля.
            provide: LIBRE_OFFICE_CONFIG,
            inject: [ConfigService],
            useFactory: (configService: ConfigService) =>
                buildLibreOfficeConfig(configService),
        },
        // Регистр prom-client общий с @lib/metrics — отдельный
        // PrometheusModule здесь не нужен, метрики попадают в /api/metrics.
        makeHistogramProvider({
            name: LIBREOFFICE_CONVERSION_DURATION_SECONDS,
            help: 'Длительность конвертации DOCX → PDF в секундах',
            labelNames: ['outcome'],
            buckets: [...LIBREOFFICE_DURATION_BUCKETS],
        }),
        makeCounterProvider({
            name: LIBREOFFICE_CONVERSION_ERRORS_TOTAL,
            help: 'Ошибки конвертации по причине (busy/timeout/cancelled/http/network)',
            labelNames: ['reason'],
        }),
        makeGaugeProvider({
            name: LIBREOFFICE_POOL_SLOTS,
            help: 'Состояние пула инстансов конвертации (capacity/active/pending/cooling)',
            labelNames: ['state'],
        }),
        LibreOfficeMetricsService,
        LibreOfficeEndpointResolver,
        LibreOfficeEndpointPool,
        LibreOfficeHttpConverter,
        LibreOfficeExecConverter,
        LibreOfficeService,
    ],
    exports: [LibreOfficeService],
})
export class LibreOfficeModule {}
