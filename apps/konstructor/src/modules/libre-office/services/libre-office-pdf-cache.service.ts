import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { copyFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { dirname } from 'path';
import { StorageService, StorageType } from '@lib/core/storage';
import {
    LIBRE_OFFICE_CONFIG,
    LibreOfficeConfig,
} from '../config/libre-office.config';

/**
 * Версия конвейера. Поднимать, когда из ОДНОГО И ТОГО ЖЕ DOCX начинает
 * получаться другой PDF: смена движка конвертации, версии Gotenberg, любых
 * параметров экспорта помимо тех, что уже попали в отпечаток настроек.
 * Правки самих шаблонов поднимать не нужно — они меняют байты DOCX, а
 * значит и ключ, сами.
 */
const PIPELINE_VERSION = 'v1';
const CACHE_SUBPATH = 'cache/libre-office-pdf';
/** Как часто подчищаем просроченное — планировщика в konstructor нет, чистим лениво. */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Кэш готовых PDF, адресуемый по содержимому DOCX.
 *
 * Почему ключ — байты DOCX, а не dto: на документ влияет слишком много
 * входных данных (сделка, клиент, менеджер, поставщик, товары, реквизиты,
 * версия шаблона), и любой перечень рано или поздно отстанет от жизни.
 * Готовый DOCX — это уже свёртка ВСЕГО, что попало в документ, а рендер
 * docxtemplater детерминирован. Значит одинаковые байты DOCX + одинаковые
 * настройки конвертации гарантируют одинаковый PDF.
 *
 * Практический смысл: превью и следующая за ним генерация того же КП дают
 * один и тот же DOCX, поэтому тяжёлая конвертация выполняется один раз.
 */
@Injectable()
export class LibreOfficePdfCacheService {
    private readonly logger = new Logger(LibreOfficePdfCacheService.name);
    private lastCleanupAt = 0;

    constructor(
        @Inject(LIBRE_OFFICE_CONFIG) private readonly config: LibreOfficeConfig,
        private readonly storageService: StorageService,
    ) {}

    /** Ключ кэша или null, если кэш выключен. */
    async keyFor(docxPath: string): Promise<string | null> {
        if (!this.config.cacheEnabled) {
            return null;
        }
        try {
            const hash = createHash('sha256').update(
                this.settingsFingerprint(),
            );
            await new Promise<void>((resolve, reject) => {
                createReadStream(docxPath)
                    .on('data', chunk => hash.update(chunk))
                    .on('end', resolve)
                    .on('error', reject);
            });
            return hash.digest('hex');
        } catch (error) {
            // Не смогли посчитать ключ — просто работаем без кэша.
            this.logger.warn(
                `Не удалось посчитать ключ кэша для ${docxPath}: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** Копирует PDF из кэша по нужному пути. false — промах. */
    async get(key: string, targetPath: string): Promise<boolean> {
        const cachePath = this.pathFor(key);
        try {
            const info = await stat(cachePath);
            if (this.isExpired(info.mtimeMs)) {
                await unlink(cachePath).catch(() => undefined);
                return false;
            }
            await copyFile(cachePath, targetPath);
            this.logger.log(`PDF взят из кэша (${key.slice(0, 12)})`);
            return true;
        } catch {
            return false;
        }
    }

    /** Складывает готовый PDF в кэш. Ошибки не должны ломать конвертацию. */
    async put(key: string, pdfPath: string): Promise<void> {
        const cachePath = this.pathFor(key);
        try {
            await mkdir(dirname(cachePath), { recursive: true });
            await copyFile(pdfPath, cachePath);
            await this.cleanupIfDue();
        } catch (error) {
            this.logger.warn(
                `Не удалось сохранить PDF в кэш: ${(error as Error).message}`,
            );
        }
    }

    private settingsFingerprint(): string {
        return `${PIPELINE_VERSION}|${JSON.stringify(this.config.pdf)}`;
    }

    private pathFor(key: string): string {
        return this.storageService.getFilePath(
            StorageType.APP,
            CACHE_SUBPATH,
            `${key}.pdf`,
        );
    }

    private isExpired(mtimeMs: number): boolean {
        return Date.now() - mtimeMs > this.config.cacheTtlHours * 3600 * 1000;
    }

    private async cleanupIfDue(): Promise<void> {
        if (Date.now() - this.lastCleanupAt < CLEANUP_INTERVAL_MS) {
            return;
        }
        this.lastCleanupAt = Date.now();
        const dir = dirname(this.pathFor('x'));
        try {
            const files = await readdir(dir);
            let removed = 0;
            for (const file of files) {
                const filePath = `${dir}/${file}`;
                const info = await stat(filePath).catch(() => null);
                if (info && this.isExpired(info.mtimeMs)) {
                    await unlink(filePath).catch(() => undefined);
                    removed++;
                }
            }
            if (removed > 0) {
                this.logger.log(`Из кэша PDF удалено просроченных: ${removed}`);
            }
        } catch (error) {
            this.logger.warn(
                `Не удалось почистить кэш PDF: ${(error as Error).message}`,
            );
        }
    }
}
