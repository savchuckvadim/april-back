import { BitrixService } from '@/modules/bitrix';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { toId } from '../../shared/department-heads/department-heads.util';
import { DUPLICATE_REPORT_FOLDER } from '../constants/duplicate-report.const';

/** Файл отчёта для Диска. */
export interface DuplicateDiskFile {
    readonly name: string;
    readonly content: Buffer;
}

/**
 * Файлы отчёта на Диске: личное хранилище владельца вебхука
 * (`disk.storage.getList`, ENTITY_TYPE user) → папка «Отчёты по дублям
 * сделок» (`disk.storage.getChildren` по имени, нет — `disk.storage.addFolder`)
 * → `disk.folder.uploadFile`. Папка — чтобы еженедельные файлы не копились
 * в корне Диска живого сотрудника. Папку не создать — файл ляжет в корень,
 * отчёт важнее порядка на Диске.
 *
 * Хранилище и папка ищутся один раз на прогон. НЕ `@Injectable`: инстанс
 * Битрикса приходит параметром (CLAUDE.md). Сбой — предупреждение и null:
 * задача уйдёт и без файла.
 */
export class DuplicateReportDisk {
    /** undefined — ещё не искали; null — искали, не нашли. */
    private storageId: number | null | undefined;
    private folderId: number | null | undefined;

    constructor(private readonly bitrix: BitrixService) {}

    /** ID загруженного файла; null — не загружен (причина в warnings). */
    async upload(
        file: DuplicateDiskFile,
        ownerId: number | null,
        warnings: string[],
    ): Promise<number | null> {
        const storageId = await this.resolveStorageId(ownerId, warnings);
        if (!storageId) return null;
        const folderId = await this.resolveFolderId(storageId, warnings);
        const request = {
            data: { NAME: file.name },
            fileContent: [file.name, file.content.toString('base64')] as [
                string,
                string,
            ],
            generateUniqueName: true,
        };
        try {
            const response = folderId
                ? await this.bitrix.disk.folder.uploadfile({
                      id: folderId,
                      ...request,
                  })
                : await this.bitrix.disk.storage.uploadfile({
                      id: storageId,
                      ...request,
                  });
            const fileId = toId(response?.result?.ID);
            if (!fileId) {
                warnings.push(
                    `файл «${file.name}» не загружен: Битрикс не вернул id файла`,
                );
            }
            return fileId;
        } catch (error) {
            warnings.push(
                `файл «${file.name}» не загружен на Диск: ${getErrorString(error)}`,
            );
            return null;
        }
    }

    /** Личное хранилище владельца вебхука на Диске. */
    private async resolveStorageId(
        ownerId: number | null,
        warnings: string[],
    ): Promise<number | null> {
        if (this.storageId !== undefined) return this.storageId;
        this.storageId = null;
        if (!ownerId) {
            warnings.push(
                'владелец вебхука не определён — файлы отчёта не загружены на Диск',
            );
            return null;
        }
        try {
            const response = await this.bitrix.disk.storage.getlist({
                ENTITY_TYPE: 'user',
                ENTITY_ID: ownerId,
            });
            this.storageId = toId(response?.result?.[0]?.ID);
            if (!this.storageId) {
                warnings.push(
                    `личный Диск сотрудника ${ownerId} не найден — файлы отчёта не загружены`,
                );
            }
        } catch (error) {
            warnings.push(
                `хранилища Диска не прочитаны: ${getErrorString(error)} — файлы отчёта не загружены`,
            );
        }
        return this.storageId;
    }

    /** Папка отчётов в корне хранилища: найти по имени или создать. */
    private async resolveFolderId(
        storageId: number,
        warnings: string[],
    ): Promise<number | null> {
        if (this.folderId !== undefined) return this.folderId;
        this.folderId = null;
        try {
            const found = await this.bitrix.disk.storage.getchildren({
                id: storageId,
                filter: { NAME: DUPLICATE_REPORT_FOLDER, TYPE: 'folder' },
            });
            this.folderId = toId(found?.result?.[0]?.ID);
            if (!this.folderId) {
                const created = await this.bitrix.disk.storage.addfolder({
                    id: storageId,
                    data: { NAME: DUPLICATE_REPORT_FOLDER },
                });
                this.folderId = toId(created?.result?.ID);
            }
        } catch (error) {
            warnings.push(
                `папка «${DUPLICATE_REPORT_FOLDER}» на Диске не создана: ${getErrorString(error)} — файлы легли в корень Диска`,
            );
        }
        return this.folderId;
    }
}
