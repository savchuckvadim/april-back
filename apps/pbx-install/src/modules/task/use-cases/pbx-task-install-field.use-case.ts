import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BxTaskFieldsInstallService } from '../../shared';
import { InstallTaskFieldDto } from '../dto/install-task-field.dto';
import { rethrowTaskUserFieldError } from '../errors/task-userfield-access.util';

/**
 * Установка полей задачи в Bitrix по уже подготовленному массиву полей (из тела запроса).
 * Только Bitrix (без синхронизации с PortalDB).
 */
@Injectable()
export class PbxTaskInstallFieldUseCase {
    constructor(private readonly pbxService: PBXService) {}

    async installTaskFields(dto: InstallTaskFieldDto): Promise<unknown> {
        const { domain, fields } = dto;
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
