import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PbxEntityType } from '@/shared';
import {
    BxUserFieldsInstallService,
    IPbxFieldInstallData,
    PortalEntityFieldInstallService,
} from '../../shared';
import { InstallUserFieldDto } from '../dto/install-user-field.dto';
import { PbxUserEntityService } from '../services/pbx-user-entity.service';

/**
 * Установка полей пользователя в Bitrix по массиву полей из тела запроса
 * + синхронизация с PortalDB (сущность USER).
 */
@Injectable()
export class PbxUserInstallFieldUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly userEntityService: PbxUserEntityService,
        private readonly portalFieldEntityInstallService: PortalEntityFieldInstallService,
    ) {}

    async installUserFields(dto: InstallUserFieldDto): Promise<unknown> {
        const { domain, fields } = dto;
        const { userId } =
            await this.userEntityService.getOrCreateUserId(domain);

        const bxFieldService = new BxUserFieldsInstallService(
            domain,
            this.pbxService,
            fields,
        );
        const bxResult = await bxFieldService.installBxFields();
        if (bxResult.countSuccess === 0) {
            throw new Error('В битриксе не удалось изменить ни одного поля');
        }

        const clearFields = bxResult.results.filter(
            field => field.bxField !== undefined,
        ) as IPbxFieldInstallData[];

        const portalFieldEntityInstallResult =
            await this.portalFieldEntityInstallService.syncWithDb(
                PbxEntityType.USER,
                userId,
                clearFields,
            );

        return { bxResult, portalFieldEntityInstallResult };
    }
}
