import { Injectable } from '@nestjs/common';
import { InstallStageSyncService } from '../install-stage-sync.service';
import type { SyncStagesForCategoryArgs } from '../sync-stages-for-category.args';

/**
 * Уже существующая воронка: без полного wipe.
 * Добавляем новые стадии из шаблона, обновляем совпадающие по STATUS_ID, удаляем лишние в Bitrix и в БД портала.
 */
@Injectable()
export class ReconcilePortalCategoryStagesUseCase {
    constructor(private readonly stageSync: InstallStageSyncService) {}

    execute(args: SyncStagesForCategoryArgs): Promise<void> {
        return this.stageSync.syncStagesForCategory({
            ...args,
            resetStagesBeforeSync: false,
        });
    }
}
