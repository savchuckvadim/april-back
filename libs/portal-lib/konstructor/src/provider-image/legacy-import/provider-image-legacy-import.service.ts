import { Injectable, Logger } from '@nestjs/common';
import { ProviderImageEntity } from '../provider-image.entity';
import { ProviderImageRepository } from '../provider-image.repository';
import { ProviderImageService } from '../provider-image.service';
import { LegacyRqFile, LegacyRqInfo } from './legacy-rq-file.entity';
import { LegacyRqFileRepository } from './legacy-rq-file.repository';
import {
    normalizeLegacyPath,
    normalizeUploadPath,
} from './lib/legacy-path.util';
import {
    LegacyImagePick,
    pickLegacyProviderImages,
} from './lib/pick-legacy-provider-images';
import { PROVIDER_IMAGE_LEGACY_IMPORT_MESSAGES as MESSAGES } from './provider-image-legacy-import.messages';
import {
    ProviderImageLegacyImportReport,
    ProviderImageLegacyImportRow,
    ProviderImageLegacyImportStatus,
    ProviderImageLegacyImportTotals,
    ProviderImageLegacyUpload,
} from './provider-image-legacy-import.types';

/** Корень путей легаси: `files.path` начинается с `clients/`. */
const LEGACY_ROOT = 'clients/';

/** Ошибку сервиса картинок целиком в отчёт не тащим: хватает первых строк. */
const MAX_MESSAGE_LENGTH = 300;

const errorText = (error: unknown): string =>
    (error instanceof Error ? error.message : String(error))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_MESSAGE_LENGTH);

const emptyTotals = (): ProviderImageLegacyImportTotals => ({
    imported: 0,
    wouldImport: 0,
    exists: 0,
    already: 0,
    noFile: 0,
    skipped: 0,
    error: 0,
});

const TOTAL_KEYS: Readonly<
    Record<
        ProviderImageLegacyImportStatus,
        keyof ProviderImageLegacyImportTotals
    >
> = {
    imported: 'imported',
    'would-import': 'wouldImport',
    exists: 'exists',
    already: 'already',
    'no-file': 'noFile',
    skipped: 'skipped',
    error: 'error',
};

/** Загруженные файлы по нормализованному пути. */
type UploadsByPath = Map<string, ProviderImageLegacyUpload>;

/**
 * ВРЕМЕННЫЙ перенос печатей, подписей и логотипов из легаси в `provider_images`.
 *
 * Загруженные файлы (копия папки `clients` из хранилища легаси) сопоставляются
 * с записями `files` реквизитов по точному пути. Для реквизитов, к которым
 * относятся загруженные файлы, правила легаси выбирают «текущую» картинку
 * каждой роли (`pickLegacyProviderImages`), остальные записи попадают в
 * отчёт как пропущенные. Запись идёт через `ProviderImageService`:
 * перекодирование sharp и лимиты остаются теми же, что у загрузки из админки.
 * Существующие картинки не перезаписываются, повторный запуск копий не
 * плодит: запись помнит `legacyFileId`.
 */
@Injectable()
export class ProviderImageLegacyImportService {
    private readonly logger = new Logger(ProviderImageLegacyImportService.name);

    constructor(
        private readonly legacy: LegacyRqFileRepository,
        private readonly images: ProviderImageRepository,
        private readonly imageService: ProviderImageService,
    ) {}

    /** Проверка (`dryRun`) или перенос загруженных файлов; отчёт по всем затронутым записям. */
    async run(
        files: readonly ProviderImageLegacyUpload[],
        dryRun: boolean,
    ): Promise<ProviderImageLegacyImportReport> {
        const uploads = this.indexUploads(files);
        const { matched, resolved, orphans } =
            await this.resolveUploads(uploads);

        const rqIds = [...new Set(matched.map(row => row.rqId))];
        const records = await this.legacy.findByRqIds(rqIds);
        const infos = new Map(
            (await this.legacy.findRqInfo(rqIds)).map(info => [
                info.rqId,
                info,
            ]),
        );

        const rows: ProviderImageLegacyImportRow[] = [];
        const existingByRq = new Map<number, ProviderImageEntity[]>();
        // записи идут по очереди: sharp и диск не нагружаются разом
        for (const pick of pickLegacyProviderImages(records)) {
            const rqId = pick.file.rqId;
            let existing = existingByRq.get(rqId);
            if (!existing) {
                existing = await this.images.findByRq(rqId);
                existingByRq.set(rqId, existing);
            }
            rows.push(
                await this.processPick(
                    pick,
                    infos.get(rqId),
                    existing,
                    resolved,
                    dryRun,
                ),
            );
        }

        rows.push(...orphans);

        const totals = emptyTotals();
        for (const row of rows) totals[TOTAL_KEYS[row.status]] += 1;
        this.logger.log(
            `Перенос картинок поставщика из легаси (${dryRun ? 'проверка' : 'запись'}): ` +
                `файлов ${uploads.size}, строк ${rows.length}, ` +
                `перенесено ${totals.imported}, к переносу ${totals.wouldImport}, ` +
                `ошибок ${totals.error}`,
        );
        return { dryRun, rows, totals };
    }

    /** Файлы по нормализованному пути; повтор одного пути — берётся первый файл. */
    private indexUploads(
        files: readonly ProviderImageLegacyUpload[],
    ): UploadsByPath {
        const uploads: UploadsByPath = new Map();
        for (const file of files) {
            const path = normalizeUploadPath(file.name);
            if (path && !uploads.has(path)) uploads.set(path, file);
        }
        return uploads;
    }

    /**
     * Сопоставление загруженных файлов с записями `files`. Путь с корнем
     * `clients/` ищется точно. Имя без корня (старый клиент прислал только
     * название файла или часть пути) ищется по хвосту пути `files.path` и
     * принимается, когда подходит ровно одна запись. Файлы без записи и с
     * неоднозначным совпадением уходят в `orphans` строками `skipped`.
     */
    private async resolveUploads(uploads: UploadsByPath): Promise<{
        /** Записи `files`, к которым нашлись загруженные файлы */
        matched: LegacyRqFile[];
        /** Загруженные файлы по нормализованному `files.path` их записи */
        resolved: UploadsByPath;
        /** Строки отчёта по файлам, которым не нашлось записи */
        orphans: ProviderImageLegacyImportRow[];
    }> {
        const exact = await this.legacy.findByPaths([...uploads.keys()]);
        const exactPaths = new Set(
            exact.map(record => normalizeLegacyPath(record.path)),
        );
        const matched = [...exact];
        const resolved: UploadsByPath = new Map();
        const orphans: ProviderImageLegacyImportRow[] = [];
        const partial: string[] = [];

        for (const [path, upload] of uploads) {
            if (exactPaths.has(path)) resolved.set(path, upload);
            else if (path.startsWith(LEGACY_ROOT)) {
                orphans.push(this.orphanRow(path, MESSAGES.noRecord));
            } else partial.push(path);
        }

        if (partial.length > 0) {
            const candidates = await this.legacy.findByPathSuffixes(partial);
            for (const path of partial) {
                const hits = this.uniqueById(
                    candidates.filter(record =>
                        normalizeLegacyPath(record.path).endsWith(`/${path}`),
                    ),
                );
                const upload = uploads.get(path);
                if (hits.length === 1 && upload) {
                    const [hit] = hits;
                    matched.push(hit);
                    const legacyPath = normalizeLegacyPath(hit.path);
                    // два файла на одну запись: берётся первый
                    if (!resolved.has(legacyPath)) {
                        resolved.set(legacyPath, upload);
                    }
                } else {
                    orphans.push(
                        this.orphanRow(
                            path,
                            hits.length === 0
                                ? MESSAGES.noRecord
                                : MESSAGES.ambiguous(hits.map(hit => hit.id)),
                        ),
                    );
                }
            }
        }
        return { matched, resolved, orphans };
    }

    private uniqueById(records: LegacyRqFile[]): LegacyRqFile[] {
        return [
            ...new Map(records.map(record => [record.id, record])).values(),
        ];
    }

    /** Строка по загруженному файлу, у которого нет записи в `files`. */
    private orphanRow(
        path: string,
        message: string,
    ): ProviderImageLegacyImportRow {
        return {
            portalDomain: null,
            rqId: 0,
            rqName: null,
            role: null,
            legacyFileId: 0,
            legacyPath: path,
            status: 'skipped',
            message,
        };
    }

    private async processPick(
        pick: LegacyImagePick,
        info: LegacyRqInfo | undefined,
        existing: readonly ProviderImageEntity[],
        resolved: UploadsByPath,
        dryRun: boolean,
    ): Promise<ProviderImageLegacyImportRow> {
        const { file, role } = pick;
        const row = (
            status: ProviderImageLegacyImportStatus,
            message: string | null,
        ): ProviderImageLegacyImportRow => ({
            portalDomain: info?.portalDomain ?? null,
            rqId: file.rqId,
            rqName: info?.rqName ?? null,
            role,
            legacyFileId: file.id,
            legacyPath: file.path,
            status,
            message,
        });

        if (role === null) return row('skipped', pick.note);

        const current = existing.find(image => image.role === role);
        if (current) {
            return current.legacyFileId === file.id
                ? row('already', MESSAGES.already(file.id))
                : row('exists', MESSAGES.exists(current.legacyFileId));
        }

        const upload = resolved.get(normalizeLegacyPath(file.path));
        if (!upload) return row('no-file', MESSAGES.noFile(file.path));
        if (!info) return row('error', MESSAGES.rqMissing(file.rqId));
        if (dryRun) return row('would-import', MESSAGES.wouldImport(role));

        try {
            await this.imageService.put(
                file.rqId,
                role,
                { buffer: upload.buffer, originalName: upload.name },
                { legacyFileId: file.id },
            );
            return row('imported', MESSAGES.imported(role));
        } catch (error) {
            return row('error', errorText(error));
        }
    }
}
