import { BitrixService } from '@lib/bitrix';
import type { IBXDiskStorageEntityType } from '@lib/bitrix/domain/disk/storage/interfaces/bx-disk-storage.interface';
import { getErrorString } from '@lib/shared/lib/utils/get-error-string.util';
import { toId } from '../recipients/department-heads.util';
import {
    ROP_DISK_TARGET_KIND,
    RopDiskTarget,
    RopReportFile,
} from './rop-delivery.types';

/** Личное хранилище сотрудника (`ENTITY_TYPE` в `disk.storage.getList`). */
const PERSONAL_STORAGE: IBXDiskStorageEntityType = 'user';
/** Тип объекта Диска «папка» в фильтре `disk.storage.getChildren`. */
const DISK_FOLDER_TYPE = 'folder';

/**
 * Файлы отчётов РОПу на Диске портала. Обобщение Диска отчёта по дублям:
 *  - папка по имени в личном Диске владельца вебхука
 *    (`disk.storage.getlist` user → `disk.storage.getchildren` по имени,
 *    нет — `disk.storage.addfolder` → `disk.folder.uploadfile`). Папку не
 *    создать — файл ложится в корень хранилища: отчёт важнее порядка;
 *  - готовая папка по id (`disk.folder.uploadfile`).
 * Файл прикладывается к задаче, поэтому получатель видит его по правам
 * задачи; отдельная раздача прав не нужна.
 *
 * Хранилище и папка ищутся один раз на прогон (один экземпляр на портал).
 * НЕ `@Injectable`: инстанс Битрикса — параметр. Сбой — предупреждение и
 * null: задача уйдёт и без файла.
 */
export class RopDiskUploader {
    /** undefined — ещё не искали; null — искали, не нашли. */
    private storageId: number | null | undefined;
    private folderId: number | null | undefined;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly target: RopDiskTarget,
    ) {}

    /** ID загруженного файла; null — не загружен (причина в warnings). */
    async upload(
        file: RopReportFile,
        ownerId: number | null,
        warnings: string[],
    ): Promise<number | null> {
        const request = {
            data: { NAME: file.name },
            fileContent: [file.name, file.content.toString('base64')] as [
                string,
                string,
            ],
            generateUniqueName: true,
        };
        try {
            if (this.target.kind === ROP_DISK_TARGET_KIND.folder) {
                const response = await this.bitrix.disk.folder.uploadfile({
                    id: this.target.folderId,
                    ...request,
                });
                return this.fileIdOf(response?.result?.ID, file, warnings);
            }
            const storageId = await this.resolveStorageId(ownerId, warnings);
            if (!storageId) return null;
            const folderId = await this.resolveFolderId(
                storageId,
                this.target.name,
                warnings,
            );
            const response = folderId
                ? await this.bitrix.disk.folder.uploadfile({
                      id: folderId,
                      ...request,
                  })
                : await this.bitrix.disk.storage.uploadfile({
                      id: storageId,
                      ...request,
                  });
            return this.fileIdOf(response?.result?.ID, file, warnings);
        } catch (error) {
            warnings.push(
                `файл «${file.name}» не загружен на Диск: ${getErrorString(error)}`,
            );
            return null;
        }
    }

    private fileIdOf(
        raw: unknown,
        file: RopReportFile,
        warnings: string[],
    ): number | null {
        const fileId = toId(raw);
        if (!fileId) {
            warnings.push(
                `файл «${file.name}» не загружен: Битрикс не вернул id файла`,
            );
        }
        return fileId;
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
                ENTITY_TYPE: PERSONAL_STORAGE,
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
        name: string,
        warnings: string[],
    ): Promise<number | null> {
        if (this.folderId !== undefined) return this.folderId;
        this.folderId = null;
        try {
            const found = await this.bitrix.disk.storage.getchildren({
                id: storageId,
                filter: { NAME: name, TYPE: DISK_FOLDER_TYPE },
            });
            this.folderId = toId(found?.result?.[0]?.ID);
            if (!this.folderId) {
                const created = await this.bitrix.disk.storage.addfolder({
                    id: storageId,
                    data: { NAME: name },
                });
                this.folderId = toId(created?.result?.ID);
            }
        } catch (error) {
            warnings.push(
                `папка «${name}» на Диске не создана: ${getErrorString(error)} — файлы легли в корень Диска`,
            );
        }
        return this.folderId;
    }
}
