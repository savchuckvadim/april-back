import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    BxTypedEntityFieldsInstallService,
    IPbxTypedFieldInstallData,
    PortalFieldTypedEntityInstallService,
} from '@/modules/pbx-install/shared';
import { Field } from '@/modules/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { ParseSmartService } from '../../services/parse/parse-smart.service';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';
import { SmartContextResolver } from '../../services/smart-context.resolver';

/**
 * Установка полей смарта из Excel-шаблона.
 *
 * Зеркало `PbxDealFieldInstallByParseUseCase`, только:
 * - источник данных — `ParseSmartService` (per-smart Excel `install/<group>/smart/<smartName>/data.xlsx`);
 * - Bitrix-сторона — `BxTypedEntityFieldsInstallService` (`userfieldconfig.*`) с `ctx` от резолвера;
 * - DB-зеркало — `PortalFieldTypedEntityInstallService` с `parent_type = ${group}_${type}`.
 *
 * Предполагает, что строка смарта в `smarts` уже существует — её создаёт оркестратор
 * `InstallSmartUseCase` через `PortalSmartService.upsertFromBitrix` ДО вызова этого use-case-а.
 */
@Injectable()
export class PbxSmartFieldInstallByParseUseCase {
    private readonly logger = new Logger(
        PbxSmartFieldInstallByParseUseCase.name,
    );

    constructor(
        private readonly pbxService: PBXService,
        private readonly parseSmartService: ParseSmartService,
        private readonly resolver: SmartContextResolver,
        private readonly portalSync: PortalFieldTypedEntityInstallService,
    ) { }

    async installSmartFields(
        domain: string,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
    ): Promise<unknown> {
        const parsed = await this.parseSmartService.getParsedData(
            smartName,
            group,
        );
        const smart = parsed[0];
        if (!smart) {
            throw new NotFoundException(
                `No smart parsed for smartName=${smartName} group=${group}`,
            );
        }
        const fields: Field[] = smart.fields ?? [];
        if (fields.length === 0) {
            return {
                bxResult: null,
                portalFieldEntityInstallResult: [],
                message: 'no fields to install',
            };
        }

        const ctx = await this.resolver.resolve({
            domain,
            type: smart.type,
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
            throw new Error('В битриксе не удалось изменить ни одного поля смарта');
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
