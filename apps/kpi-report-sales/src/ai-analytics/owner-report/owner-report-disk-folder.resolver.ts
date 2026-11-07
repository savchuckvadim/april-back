import { Injectable, Logger } from '@nestjs/common';
import type { BitrixService } from '@/modules/bitrix';
import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_CACHE_PREFIX } from '../constants/ai-analytics.const';

/** Папки на Диске группы «задачи ОП»: как у документов konstructor, но своя ветка. */
export const OWNER_REPORT_DISK_FOLDERS = {
    root: 'AI-аналитика',
    reports: 'Отчёт собственнику',
} as const;

/** Папка группы меняется редко: неделя кэша, промах — один обход Диска. */
export const OWNER_REPORT_DISK_FOLDER_TTL_SECONDS = 7 * 24 * 60 * 60;

export function buildOwnerReportDiskFolderKey(domain: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:owner-report:disk-folder`;
}

/**
 * Папка для PDF отчёта собственнику, когда настройка
 * `ai_analytics_owner_report_disk_folder_id` пуста: хранилище Диска группы
 * задач отдела продаж (той же, куда konstructor кладёт КП и договоры) →
 * папка «AI-аналитика» → «Отчёт собственнику». Папки создаются при первом
 * выпуске; id — в кэше на неделю. Любой сбой — null: выпуск уходит в
 * хранилище приложения, как раньше.
 *
 * `@Injectable` без bitrix-состояния: инстанс и модель портала приходят
 * аргументами от вызывающего (у него они уже есть после `PBXService.init`).
 */
@Injectable()
export class OwnerReportDiskFolderResolver {
    private readonly logger = new Logger(OwnerReportDiskFolderResolver.name);

    constructor(private readonly cache: AiAnalyticsCacheService) {}

    async resolve(
        domain: string,
        bitrix: BitrixService,
        portalModel: PortalModel,
    ): Promise<number | null> {
        const key = buildOwnerReportDiskFolderKey(domain);
        const cached = await this.cache.getJson<number>(key);
        if (cached) return cached;
        try {
            const folderId = await this.ensureFolders(bitrix, portalModel);
            if (folderId) {
                await this.cache.setJson(
                    key,
                    folderId,
                    OWNER_REPORT_DISK_FOLDER_TTL_SECONDS,
                );
            }
            return folderId;
        } catch (error) {
            this.logger.warn(
                `Отчёт собственнику ${domain}: папка на Диске группы не найдена — ${(error as Error).message}`,
            );
            return null;
        }
    }

    private async ensureFolders(
        bitrix: BitrixService,
        portalModel: PortalModel,
    ): Promise<number | null> {
        const groupId = portalModel.getSalesTaskGroupId();
        const storages = await bitrix.disk.storage.getlist({
            ENTITY_TYPE: 'group',
            ENTITY_ID: groupId,
        });
        const storage = storages.result?.[0];
        if (!storage) return null;
        const root = await this.ensureStorageFolder(
            bitrix,
            Number(storage.ID),
            OWNER_REPORT_DISK_FOLDERS.root,
        );
        return this.ensureSubfolder(
            bitrix,
            root,
            OWNER_REPORT_DISK_FOLDERS.reports,
        );
    }

    /** Папка первого уровня хранилища: найти по имени или создать. */
    private async ensureStorageFolder(
        bitrix: BitrixService,
        storageId: number,
        name: string,
    ): Promise<number> {
        const children = await bitrix.disk.storage.getchildren({
            id: storageId,
            filter: { TYPE: 'folder', NAME: name },
        });
        const found = children.result?.[0];
        if (found?.ID) return Number(found.ID);
        const created = await bitrix.disk.storage.addfolder({
            id: storageId,
            data: { NAME: name },
        });
        const id = Number(created.result?.ID);
        if (!id) throw new Error(`папка «${name}» не создана`);
        return id;
    }

    /** Вложенная папка: найти по имени или создать. */
    private async ensureSubfolder(
        bitrix: BitrixService,
        parentId: number,
        name: string,
    ): Promise<number> {
        const children = await bitrix.disk.folder.getchildren({
            id: parentId,
            filter: { TYPE: 'folder', NAME: name },
        });
        const found = children.result?.[0];
        if (found?.ID) return Number(found.ID);
        const created = await bitrix.disk.folder.addsubfolder({
            id: parentId,
            data: { NAME: name },
        });
        const id = Number(created.result?.ID);
        if (!id) throw new Error(`папка «${name}» не создана`);
        return id;
    }
}
