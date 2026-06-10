import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PbxEntityType } from '@/shared';
import {
    BxUserFieldsInstallService,
    IPbxFieldInstallData,
    PortalEntityFieldInstallService,
} from '../../shared';
import { PbxUserParseService } from '../services/pbx-user-parse.service';
import { PbxUserEntityService } from '../services/pbx-user-entity.service';

/**
 * Установка полей пользователя в Bitrix из констант + синхронизация с PortalDB.
 * 1. Получаем/создаём сущность user в PortalDB по домену.
 * 2. Берём поля пользователя из констант (isNeedUpdate).
 * 3. Добавляем/обновляем их в Bitrix (user.userfield.*).
 * 4. Синхронизируем результат с PortalDB (сущность USER).
 */
@Injectable()
export class PbxUserInstallUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseService: PbxUserParseService,
        private readonly userEntityService: PbxUserEntityService,
        private readonly portalFieldEntityInstallService: PortalEntityFieldInstallService,
    ) {}

    async installUserFields(domain: string): Promise<unknown> {
        const { userId } =
            await this.userEntityService.getOrCreateUserId(domain);
        const fields = this.parseService.getFieldsForInstall();

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
