import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
import {
    LIBREOFFICE_CONVERSION_DURATION_SECONDS,
    LIBREOFFICE_CONVERSION_ERRORS_TOTAL,
    LIBREOFFICE_PDF_CACHE_TOTAL,
    LIBREOFFICE_POOL_SLOTS,
} from '../config/libre-office.metrics';
import { LibreOfficeErrorReason } from '../errors/libre-office.errors';
import { LibreOfficePoolStats } from './libre-office-endpoint-pool.service';

/**
 * Метрики конвертации. Отдельный сервис, чтобы Prometheus не протекал
 * в пул и конвертеры: они дёргают методы, а не работают с prom-client.
 *
 * Что смотреть в Grafana:
 * - libreoffice_pool_slots{state="pending"} стабильно > 0 → пора добавлять инстанс;
 * - libreoffice_conversion_errors_total{reason="busy"} растёт → очередь не успевает;
 * - reason="timeout" → тяжёлые документы, а не нехватка инстансов.
 */
@Injectable()
export class LibreOfficeMetricsService {
    constructor(
        @InjectMetric(LIBREOFFICE_CONVERSION_DURATION_SECONDS)
        private readonly duration: Histogram<string>,
        @InjectMetric(LIBREOFFICE_CONVERSION_ERRORS_TOTAL)
        private readonly errors: Counter<string>,
        @InjectMetric(LIBREOFFICE_POOL_SLOTS)
        private readonly poolSlots: Gauge<string>,
        @InjectMetric(LIBREOFFICE_PDF_CACHE_TOTAL)
        private readonly cache: Counter<string>,
    ) {}

    /**
     * Попадания в кэш готовых PDF. Доля hit — прямая метрика того, сколько
     * тяжёлых конвертаций мы вообще не выполняли.
     */
    countCache(result: 'hit' | 'miss'): void {
        this.cache.labels(result).inc();
    }

    observeConversion(seconds: number, outcome: 'ok' | 'error'): void {
        this.duration.labels(outcome).observe(seconds);
    }

    countError(reason: LibreOfficeErrorReason): void {
        this.errors.labels(reason).inc();
    }

    syncPool(stats: LibreOfficePoolStats): void {
        this.poolSlots.labels('capacity').set(stats.capacity);
        this.poolSlots.labels('active').set(stats.active);
        this.poolSlots.labels('pending').set(stats.pending);
        this.poolSlots.labels('cooling').set(stats.cooling);
    }
}
