import { Inject, Injectable, Logger } from '@nestjs/common';
import { basename, join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import {
    LIBRE_OFFICE_CONFIG,
    LibreOfficeConfig,
    LibreOfficePdfOptions,
} from '../config/libre-office.config';
import {
    LibreOfficeBusyError,
    LibreOfficeCancelledError,
    LibreOfficeConvertError,
    LibreOfficeTimeoutError,
    isRetryableStatus,
} from '../errors/libre-office.errors';
import { LibreOfficeEndpointPool } from './libre-office-endpoint-pool.service';
import { replaceExtension } from '../utils/replace-extension.util';

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 5_000;

/**
 * DOCX → PDF через HTTP (Gotenberg). Параллелизм ограничен пулом, у каждого
 * запроса свой таймаут, транзиентные ошибки ретраятся на другом инстансе,
 * а подбитый инстанс уходит в cooldown.
 */
@Injectable()
export class LibreOfficeHttpConverter {
    private readonly logger = new Logger(LibreOfficeHttpConverter.name);

    constructor(
        @Inject(LIBRE_OFFICE_CONFIG) private readonly config: LibreOfficeConfig,
        private readonly pool: LibreOfficeEndpointPool,
    ) {}

    async convert(
        inputPath: string,
        outputFolder: string,
        signal?: AbortSignal,
    ): Promise<string> {
        // Отменённую операцию не пускаем даже в очередь пула — слот не занимаем.
        if (signal?.aborted) {
            throw new LibreOfficeCancelledError();
        }
        const name = basename(inputPath);
        const docxBuffer = await readFile(inputPath);
        const pdfBuffer = await this.convertWithRetry(name, docxBuffer, signal);
        const outputFilePath = join(
            outputFolder,
            replaceExtension(name, '.pdf'),
        );
        await writeFile(outputFilePath, pdfBuffer);
        return outputFilePath;
    }

    private async convertWithRetry(
        name: string,
        docxBuffer: Buffer,
        signal?: AbortSignal,
    ): Promise<Buffer> {
        const attempts = this.config.retries + 1;
        let lastFailedUrl: string | undefined;
        let lastError: unknown;

        for (let attempt = 0; attempt < attempts; attempt++) {
            // Инстанс выбирает пул, а знать его должен ретрай — чтобы уйти
            // на другой. Поэтому запоминаем прямо в момент выбора: так это
            // работает для любой ошибки, включая сетевую.
            let attemptUrl: string | undefined;
            try {
                return await this.pool.run(baseUrl => {
                    attemptUrl = baseUrl;
                    return this.postOnce(baseUrl, name, docxBuffer, signal);
                }, lastFailedUrl);
            } catch (error) {
                lastError = error;
                lastFailedUrl = attemptUrl ?? lastFailedUrl;
                // Транзиентная ошибка — вина инстанса, а не документа:
                // помечаем его, даже если попытки уже кончились.
                if (attemptUrl && this.isRetryable(error)) {
                    this.pool.penalize(attemptUrl);
                }
                if (!this.isRetryable(error) || attempt === attempts - 1) {
                    throw error;
                }
                const delayMs = this.backoffMs(attempt);
                this.logger.warn(
                    `Попытка ${attempt + 1}/${attempts} для ${name} не удалась (${(error as Error).message}), повтор через ${delayMs} мс`,
                );
                await this.sleep(delayMs, signal);
            }
        }
        // недостижимо: последняя итерация всегда либо возвращает, либо бросает
        throw lastError instanceof Error
            ? lastError
            : new LibreOfficeConvertError('Конвертация не выполнена');
    }

    private async postOnce(
        baseUrl: string,
        name: string,
        docxBuffer: Buffer,
        externalSignal?: AbortSignal,
    ): Promise<Buffer> {
        const url = `${baseUrl}/forms/libreoffice/convert`;
        const timeoutController = new AbortController();
        const timer = setTimeout(
            () => timeoutController.abort(),
            this.config.timeoutMs,
        );
        const signal = externalSignal
            ? AbortSignal.any([timeoutController.signal, externalSignal])
            : timeoutController.signal;
        const startedAt = Date.now();
        this.logger.log(`POST ${url} (${name}, ${docxBuffer.length} байт)`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: this.buildForm(name, docxBuffer, this.config.pdf),
                signal,
            });
            if (!response.ok) {
                const text = await response.text();
                throw new LibreOfficeConvertError(
                    `Конвертация отклонена (${response.status}): ${text.slice(0, 500)}`,
                    response.status,
                );
            }
            const pdfBuffer = Buffer.from(await response.arrayBuffer());
            this.logger.log(
                `PDF готов: ${name} → ${pdfBuffer.length} байт за ${Date.now() - startedAt} мс`,
            );
            return pdfBuffer;
        } catch (error) {
            // Отмена клиентом и наш таймаут выглядят одинаково (abort),
            // но означают разное — различаем по тому, чей сигнал сработал.
            if (externalSignal?.aborted) {
                throw new LibreOfficeCancelledError();
            }
            if (timeoutController.signal.aborted) {
                throw new LibreOfficeTimeoutError(
                    this.config.timeoutMs,
                    baseUrl,
                );
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    private buildForm(
        name: string,
        docxBuffer: Buffer,
        pdf: LibreOfficePdfOptions,
    ): FormData {
        const form = new FormData();
        form.append('files', new Blob([new Uint8Array(docxBuffer)]), name);
        if (pdf.reduceImageResolution) {
            form.append('reduceImageResolution', 'true');
            if (pdf.maxImageResolution) {
                form.append(
                    'maxImageResolution',
                    String(pdf.maxImageResolution),
                );
            }
        }
        if (pdf.quality) {
            form.append('losslessImageCompression', 'false');
            form.append('quality', String(pdf.quality));
        }
        return form;
    }

    /**
     * Ретраим только то, что имеет шанс пройти со второй попытки:
     * перегруз инстанса и сетевые сбои. Таймаут не ретраим — документ
     * тяжёлый, вторая попытка просто съест ещё столько же времени.
     * Busy и отмену — тем более.
     */
    private isRetryable(error: unknown): boolean {
        if (
            error instanceof LibreOfficeTimeoutError ||
            error instanceof LibreOfficeBusyError ||
            error instanceof LibreOfficeCancelledError
        ) {
            return false;
        }
        if (error instanceof LibreOfficeConvertError) {
            return (
                error.status !== undefined && isRetryableStatus(error.status)
            );
        }
        return error instanceof Error;
    }

    private backoffMs(attempt: number): number {
        const exponential = BACKOFF_BASE_MS * 2 ** attempt;
        return (
            Math.min(BACKOFF_MAX_MS, exponential) +
            Math.floor(Math.random() * 250)
        );
    }

    /** Пауза перед ретраем, прерываемая отменой операции. */
    private sleep(ms: number, signal?: AbortSignal): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            const onAbort = (): void => {
                clearTimeout(timer);
                reject(new LibreOfficeCancelledError());
            };
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }
}
