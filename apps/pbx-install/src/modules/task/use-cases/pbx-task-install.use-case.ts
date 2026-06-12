import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BxTaskFieldsInstallService } from '../../shared';
import { PbxTaskParseService } from '../services/pbx-task-parse.service';
import { rethrowTaskUserFieldError } from '../errors/task-userfield-access.util';

/**
 * Установка полей задачи в Bitrix из констант.
 *
 * Только Bitrix: в PortalDB нет сущности task, поэтому синхронизация с БД
 * не выполняется.
 * 1. Берём поля задачи из констант (isNeedUpdate).
 * 2. Добавляем/обновляем их в Bitrix через task.item.userfield.*.
 */
@Injectable()
export class PbxTaskInstallUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseService: PbxTaskParseService,
    ) {}

    async installTaskFields(domain: string): Promise<unknown> {
        const fields = this.parseService.getFieldsForInstall();
        const bxFieldService = new BxTaskFieldsInstallService(
            domain,
            this.pbxService,
            fields,
        );
        try {
            const bxResult = await bxFieldService.installBxFields();
            if (bxResult.countSuccess === 0) {
                throw new Error(
                    'В битриксе не удалось изменить ни одного поля',
                );
            }
            return { bxResult };
        } catch (error) {
            rethrowTaskUserFieldError(error);
        }
    }
}
