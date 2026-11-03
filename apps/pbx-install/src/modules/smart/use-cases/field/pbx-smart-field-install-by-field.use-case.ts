import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { typedFieldInstallFailure } from '@app/pbx-install/shared/typed-entity/field/typed-entity-field-failure';
import { PortalOnlineCacheService } from '@lib/portal-lib/store/portal-online-cache.service';
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
        private readonly portalCache: PortalOnlineCacheService,
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
            // Причина по каждому полю (03.11.2026: на gsr это был лимит
            // пользовательских полей ПОРТАЛА, а ручка отвечала голым 500).
            throw typedFieldInstallFailure(bxResult, fields, 'smart');
        }

        const clearFields = bxResult.results.filter(
            r => r.bxField !== undefined,
        ) as IPbxTypedFieldInstallData[];

        const portalFieldEntityInstallResult = await this.portalSync.syncWithDb(
            ctx.owner,
            clearFields,
            domain,
        );

        // Поля изменились — сброс online-кэша portal_${domain} (TTL 10 ч).
        await this.portalCache.invalidate(domain);

        return { bxResult, portalFieldEntityInstallResult };
    }
}
