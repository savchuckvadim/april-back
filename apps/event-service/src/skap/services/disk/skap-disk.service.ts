import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { IBXDiskFolderItem } from '@lib/bitrix/domain/disk';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { SKAP_DISK_FOLDER_NAME } from '@lib/skap-lib';

/** Файл из папки загрузок СКАП (сырой листинг Диска). */
export interface SkapDiskFileEntry {
    diskFileId: string;
    name: string;
    /** Путь от папки загрузок («август 2024/61-40762/x.csv» или «x.zip»). */
    relativePath: string;
    updateTime: Date | null;
    size: bigint | null;
}

/** Максимальная глубина обхода подпапок (месяц/РП — достаточно 4). */
const MAX_WALK_DEPTH = 4;

/**
 * Диск Битрикс для импорта СКАП: резолв группы отдела сервиса и папки
 * загрузок, рекурсивный листинг, скачивание файлов.
 *
 * НЕ @Injectable: создаётся `new SkapDiskService(bitrix, portalModel)`
 * под конкретный домен (правило CLAUDE.md — никакого this.bitrix в
 * singleton-сервисах). Группу сервис НЕ создаёт — она ставится каноном
 * pbx-install (PbxGroupInstallUseCase) и читается из PortalDB.
 */
export class SkapDiskService {
    private readonly logger = new Logger(SkapDiskService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
    ) {}

    /**
     * Группа для папки загрузок: override из настроек портала либо группа
     * отдела сервиса из PortalDB (callings, group=service).
     */
    resolveGroupId(settingsGroupId: number): number {
        if (settingsGroupId > 0) return settingsGroupId;
        const serviceGroup = this.portalModel.getCallingGroupByCode('service');
        if (!serviceGroup?.bitrixId) {
            throw new Error(
                'Группа отдела сервиса не установлена на портале: установите ' +
                    'группу через pbx-install (группы звонков) или задайте ' +
                    'group_id в настройках приложения skap.',
            );
        }
        return Number(serviceGroup.bitrixId);
    }

    /**
     * Папка загрузок «СКАП. Загрузка» в хранилище группы:
     * найти по имени, при отсутствии — создать. Возвращает ID папки
     * (кэшируется в настройках портала вызывающим кодом).
     */
    async resolveUploadFolderId(
        groupId: number,
        settingsFolderId: number,
    ): Promise<number> {
        if (settingsFolderId > 0) return settingsFolderId;

        const storages = await this.bitrix.disk.storage.getlist({
            ENTITY_TYPE: 'group',
            ENTITY_ID: groupId,
        });
        const rootStorageId = storages.result?.[0]?.ID;
        if (!rootStorageId) {
            throw new Error(
                `Хранилище Диска группы ${groupId} не найдено — проверьте, ` +
                    'что у группы включён Диск.',
            );
        }

        const existing = await this.bitrix.disk.storage.getchildren({
            id: String(rootStorageId),
            filter: { TYPE: 'folder', NAME: SKAP_DISK_FOLDER_NAME },
        });
        const found = existing.result?.find(
            item => item.NAME === SKAP_DISK_FOLDER_NAME,
        );
        if (found?.ID) return Number(found.ID);

        const created = await this.bitrix.disk.storage.addfolder({
            id: Number(rootStorageId),
            data: { NAME: SKAP_DISK_FOLDER_NAME },
            rights: [],
        });
        if (!created.result?.ID) {
            throw new Error(
                `Не удалось создать папку «${SKAP_DISK_FOLDER_NAME}» в группе ${groupId}`,
            );
        }
        this.logger.log(
            `Создана папка «${SKAP_DISK_FOLDER_NAME}» (id=${created.result.ID}) в группе ${groupId}`,
        );
        return Number(created.result.ID);
    }

    /**
     * Рекурсивный листинг файлов папки загрузок (подпапки месяцев/РП —
     * до {@link MAX_WALK_DEPTH} уровней), с пагинацией по 50.
     */
    async listFiles(folderId: number): Promise<SkapDiskFileEntry[]> {
        const out: SkapDiskFileEntry[] = [];
        await this.walk(folderId, '', 0, out);
        return out;
    }

    private async walk(
        folderId: number,
        prefix: string,
        depth: number,
        out: SkapDiskFileEntry[],
    ): Promise<void> {
        const children = await this.bitrix.disk.folder.getchildrenAll({
            id: folderId,
        });
        for (const child of children) {
            const name = String(child.NAME ?? '');
            const relativePath = prefix ? `${prefix}/${name}` : name;
            if (child.TYPE === 'folder') {
                if (depth < MAX_WALK_DEPTH && child.ID) {
                    await this.walk(
                        Number(child.ID),
                        relativePath,
                        depth + 1,
                        out,
                    );
                }
                continue;
            }
            if (!child.ID) continue;
            out.push({
                diskFileId: String(child.ID),
                name,
                relativePath,
                updateTime: this.parseDiskTime(child),
                size: child.SIZE != null ? BigInt(child.SIZE) : null,
            });
        }
    }

    /**
     * Скачивание файла: свежий disk.file.get обязателен — DOWNLOAD_URL
     * подписан и протухает (урок call-analysis).
     */
    async downloadFile(diskFileId: string): Promise<Buffer> {
        const file = await this.bitrix.disk.file.get({
            id: Number(diskFileId),
        });
        const url = file.result?.DOWNLOAD_URL;
        if (!url) {
            throw new Error(
                `У файла ${diskFileId} нет DOWNLOAD_URL (удалён или нет прав)`,
            );
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(
                `Скачивание файла ${diskFileId} не удалось: HTTP ${response.status}`,
            );
        }
        return Buffer.from(await response.arrayBuffer());
    }

    private parseDiskTime(item: IBXDiskFolderItem): Date | null {
        const raw = item.UPDATE_TIME ?? item.CREATE_TIME;
        if (!raw) return null;
        const date = new Date(String(raw));
        return Number.isNaN(date.getTime()) ? null : date;
    }
}
