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
import {
    LibreOfficeEndpointPool,
    LibreOfficePoolStats,
} from './services/libre-office-endpoint-pool.service';

/**
 * Фасад конвертации DOCX → PDF: выбирает стратегию по LIBREOFFICE_MODE,
 * готовит выходную папку и снимает метрики. Вся логика параллелизма,
 * таймаутов и ретраев — в конвертерах, чтобы вызывающий код о них не знал.
 */
@Injectable()
export class LibreOfficeService {
    constructor(
        @Inject(LIBRE_OFFICE_CONFIG) private readonly config: LibreOfficeConfig,
        private readonly httpConverter: LibreOfficeHttpConverter,
        private readonly execConverter: LibreOfficeExecConverter,
        private readonly pool: LibreOfficeEndpointPool,
        private readonly metrics: LibreOfficeMetricsService,
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

        const startedAt = Date.now();
        try {
            const result =
                this.config.mode === 'http'
                    ? await this.httpConverter.convert(
                          inputPath,
                          outputFolder,
                          signal,
                      )
                    : await this.execConverter.convert(
                          inputPath,
                          outputFolder,
                          signal,
                      );
            this.metrics.observeConversion(this.secondsSince(startedAt), 'ok');
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

    private secondsSince(startedAt: number): number {
        return (Date.now() - startedAt) / 1000;
    }
}
