import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    BxTypedEntityFieldsInstallService,
    IPbxTypedFieldInstallData,
    PortalFieldTypedEntityInstallService,
} from '@app/pbx-install/shared';
import { InstallSmartFieldDto } from '../../dto/install-smart-field.dto';
import { SmartContextResolver } from '../../services/smart-context.resolver';

/**
 * Установка полей смарта по body-DTO (без чтения Excel).
 * Аналог `PbxDealFieldInstallByFieldUseCase`, только Bitrix-side через `userfieldconfig.*`.
 */
@Injectable()
export class PbxSmartFieldInstallByFieldUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly resolver: SmartContextResolver,
        private readonly portalSync: PortalFieldTypedEntityInstallService,
    ) {}

    async installSmartFields(dto: InstallSmartFieldDto): Promise<unknown> {
        const { domain, smartName, group, fields } = dto;
        const ctx = await this.resolver.resolve({
            domain,
            type: smartName,
            group,
        });

        const bxFieldService = new BxTypedEntityFieldsInstallService(
            domain,
            this.pbxService,
            ctx.bxCtx,
            fields,
        );
        const bxResult = await bxFieldService.installFields();
        if (bxResult.countSuccess === 0) {
            throw new Error(
                'В битриксе не удалось изменить ни одного поля смарта',
            );
        }

        const clearFields = bxResult.results.filter(
            r => r.bxField !== undefined,
        ) as IPbxTypedFieldInstallData[];

        const portalFieldEntityInstallResult = await this.portalSync.syncWithDb(
            ctx.owner,
            clearFields,
        );

        return { bxResult, portalFieldEntityInstallResult };
    }
}
