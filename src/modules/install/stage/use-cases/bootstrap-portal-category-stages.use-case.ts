import { Injectable } from '@nestjs/common';
import { InstallStageSyncService } from '../install-stage-sync.service';
import type { SyncStagesForCategoryArgs } from '../sync-stages-for-category.args';

/**
 * Новая воронка в Bitrix после `crm.category.add`: дефолтные стадии мешают шаблонным SORT/семантике.
 * Сносим все `crm.status` по ENTITY_ID воронки, затем заливаем только стадии из шаблона.
 */
@Injectable()
export class BootstrapPortalCategoryStagesUseCase {
    constructor(private readonly stageSync: InstallStageSyncService) {}

    execute(args: SyncStagesForCategoryArgs): Promise<void> {
        return this.stageSync.syncStagesForCategory({
            ...args,
            resetStagesBeforeSync: true,
        });
    }
}
