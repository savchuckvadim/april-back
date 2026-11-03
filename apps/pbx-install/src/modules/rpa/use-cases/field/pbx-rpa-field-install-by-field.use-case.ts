import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { typedFieldInstallFailure } from '@app/pbx-install/shared/typed-entity/field/typed-entity-field-failure';
import {
    BxTypedEntityFieldsInstallService,
    IPbxTypedFieldInstallData,
    PortalFieldTypedEntityInstallService,
} from '@app/pbx-install/shared';
import { InstallRpaFieldDto } from '../../dto/install-rpa-field.dto';
import { RpaContextResolver } from '../../services/rpa-context.resolver';

/**
 * Установка полей RPA по body-DTO (без чтения Excel).
 * Аналог `PbxSmartFieldInstallByFieldUseCase`, Bitrix-side через `userfieldconfig` (`moduleId: 'rpa'`).
 */
@Injectable()
export class PbxRpaFieldInstallByFieldUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly resolver: RpaContextResolver,
        private readonly portalSync: PortalFieldTypedEntityInstallService,
    ) {}

    async installRpaFields(dto: InstallRpaFieldDto): Promise<unknown> {
        const { domain, rpaName, fields } = dto;
        const ctx = await this.resolver.resolve({ domain, rpaName });

        const bxFieldService = new BxTypedEntityFieldsInstallService(
            domain,
            this.pbxService,
            ctx.bxCtx,
            fields,
        );
        const bxResult = await bxFieldService.installFields();
        if (bxResult.countSuccess === 0) {
            // Причина по каждому полю (03.11.2026: на gsr это был лимит
            // пользовательских полей ПОРТАЛА, а ручка отвечала голым 500).
            throw typedFieldInstallFailure(bxResult, fields, 'rpa');
        }

        const clearFields = bxResult.results.filter(
            r => r.bxField !== undefined,
        ) as IPbxTypedFieldInstallData[];

        const portalFieldEntityInstallResult = await this.portalSync.syncWithDb(
            ctx.owner,
            clearFields,
            domain,
        );

        return { bxResult, portalFieldEntityInstallResult };
    }
}
