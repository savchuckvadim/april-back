import { Inject, Injectable } from '@nestjs/common';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import {
    LIBRE_OFFICE_CONFIG,
    LibreOfficeConfig,
} from './config/libre-office.config';
import { libreOfficeErrorReason } from './errors/libre-office.errors';
import { LibreOfficeExecConverter } from './services/libre-office-exec.converter';
import { LibreOfficeHttpConverter } from './services/libre-office-http.converter';
import { LibreOfficeMetricsService } from './services/libre-office-metrics.service';
import { LibreOfficePdfCacheService } from './services/libre-office-pdf-cache.service';
import {
    LibreOfficeEndpointPool,
    LibreOfficePoolStats,
} from './services/libre-office-endpoint-pool.service';
import { pdfPathFor } from './utils/replace-extension.util';

/**
 * Фасад конвертации DOCX → PDF: кэш по содержимому, выбор стратегии по
 * LIBREOFFICE_MODE, выходная папка и метрики. Логика параллелизма, таймаутов
 * и ретраев — в конвертерах, чтобы вызывающий код о них не знал.
 */
@Injectable()
export class LibreOfficeService {
    constructor(
        @Inject(LIBRE_OFFICE_CONFIG) private readonly config: LibreOfficeConfig,
        private readonly httpConverter: LibreOfficeHttpConverter,
        private readonly execConverter: LibreOfficeExecConverter,
        private readonly pool: LibreOfficeEndpointPool,
        private readonly metrics: LibreOfficeMetricsService,
        private readonly cache: LibreOfficePdfCacheService,
    ) {}

    /** Загруженность пула — для диагностики (в метриках то же самое). */
    poolStats(): LibreOfficePoolStats {
        return this.pool.stats();
    }

    /**
     * @param signal прерывает конвертацию при отмене операции — слот пула
     * освобождается сразу, а не через таймаут.
     */
    async convertToPdf(
        inputPath: string,
        outputDir?: string,
        signal?: AbortSignal,
    ): Promise<string> {
        if (!existsSync(inputPath)) {
            throw new Error(`Input file not found: ${inputPath}`);
        }
        const outputFolder = outputDir || dirname(inputPath);
        if (!existsSync(outputFolder)) {
            mkdirSync(outputFolder, { recursive: true });
        }

        // Тот же документ мог быть сконвертирован раньше (превью → отправка):
        // одинаковые байты DOCX означают одинаковый PDF.
        const cacheKey = await this.cache.keyFor(inputPath);
        const outputFilePath = pdfPathFor(inputPath, outputFolder);
        if (cacheKey && (await this.cache.get(cacheKey, outputFilePath))) {
            this.metrics.countCache('hit');
            return outputFilePath;
        }
        if (cacheKey) {
            this.metrics.countCache('miss');
        }

        return this.convertAndCache(inputPath, outputFolder, cacheKey, signal);
    }

    private async convertAndCache(
        inputPath: string,
        outputFolder: string,
        cacheKey: string | null,
        signal?: AbortSignal,
    ): Promise<string> {
        const startedAt = Date.now();
        try {
            const result = await this.convertWith(
                inputPath,
                outputFolder,
                signal,
            );
            this.metrics.observeConversion(this.secondsSince(startedAt), 'ok');
            if (cacheKey) {
                await this.cache.put(cacheKey, result);
            }
            return result;
        } catch (error) {
            this.metrics.observeConversion(
                this.secondsSince(startedAt),
                'error',
            );
            this.metrics.countError(libreOfficeErrorReason(error));
            throw error;
        } finally {
            this.metrics.syncPool(this.pool.stats());
        }
    }

    private convertWith(
        inputPath: string,
        outputFolder: string,
        signal?: AbortSignal,
    ): Promise<string> {
        return this.config.mode === 'http'
            ? this.httpConverter.convert(inputPath, outputFolder, signal)
            : this.execConverter.convert(inputPath, outputFolder, signal);
    }

    private secondsSince(startedAt: number): number {
        return (Date.now() - startedAt) / 1000;
    }
}
