import { Inject, Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { basename, join } from 'path';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
import {
    LIBRE_OFFICE_CONFIG,
    LibreOfficeConfig,
} from '../config/libre-office.config';
import {
    LibreOfficeCancelledError,
    LibreOfficeConvertError,
    LibreOfficeTimeoutError,
} from '../errors/libre-office.errors';
import { replaceExtension } from '../utils/replace-extension.util';
import { Semaphore } from '@lib/shared';

const execAsync = promisify(exec);

/**
 * DOCX → PDF локальным `soffice` (dev и образы с установленным LibreOffice).
 *
 * Два важных момента, из-за которых нельзя просто вызывать soffice:
 * 1. Каждому вызову нужен СВОЙ профиль (-env:UserInstallation) — иначе второй
 *    процесс не конвертирует, а отдаёт задание первому и молча выходит.
 * 2. Нужен таймаут: без него подвисший soffice держит job навсегда.
 */
@Injectable()
export class LibreOfficeExecConverter {
    private readonly logger = new Logger(LibreOfficeExecConverter.name);
    private readonly limiter: Semaphore;

    constructor(
        @Inject(LIBRE_OFFICE_CONFIG) private readonly config: LibreOfficeConfig,
    ) {
        this.limiter = new Semaphore(config.slotsPerEndpoint);
    }

    async convert(
        inputPath: string,
        outputFolder: string,
        signal?: AbortSignal,
    ): Promise<string> {
        if (signal?.aborted) {
            throw new LibreOfficeCancelledError();
        }
        return this.limiter.run(() =>
            this.runSoffice(inputPath, outputFolder, signal),
        );
    }

    private async runSoffice(
        inputPath: string,
        outputFolder: string,
        signal?: AbortSignal,
    ): Promise<string> {
        const profileDir = join(tmpdir(), `lo-profile-${randomUUID()}`);
        const profileUrl = pathToFileURL(profileDir).href;
        const command = [
            'soffice',
            '--headless',
            `-env:UserInstallation=${profileUrl}`,
            '--convert-to pdf',
            `--outdir "${outputFolder}"`,
            `"${inputPath}"`,
        ].join(' ');

        this.logger.log(`Конвертация ${basename(inputPath)} через soffice`);
        try {
            await execAsync(command, {
                timeout: this.config.timeoutMs,
                signal,
            });
        } catch (error) {
            // Отмена и таймаут оба убивают процесс — различаем по сигналу.
            if (signal?.aborted) {
                throw new LibreOfficeCancelledError();
            }
            if (this.isTimeout(error)) {
                throw new LibreOfficeTimeoutError(
                    this.config.timeoutMs,
                    'soffice',
                );
            }
            throw new LibreOfficeConvertError(
                `soffice завершился с ошибкой: ${(error as Error).message}`,
            );
        } finally {
            await rm(profileDir, { recursive: true, force: true }).catch(
                () => undefined,
            );
        }

        const outputFilePath = join(
            outputFolder,
            replaceExtension(basename(inputPath), '.pdf'),
        );
        if (!existsSync(outputFilePath)) {
            throw new LibreOfficeConvertError('Конвертация не создала PDF');
        }
        return outputFilePath;
    }

    private isTimeout(error: unknown): boolean {
        const killed = (error as { killed?: boolean }).killed === true;
        const signal = (error as { signal?: string }).signal;
        return killed || signal === 'SIGTERM';
    }
}
