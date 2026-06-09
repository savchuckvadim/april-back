import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    BxTypedEntityFieldsInstallService,
    IPbxTypedFieldInstallData,
    PortalFieldTypedEntityInstallService,
} from '@app/pbx-install/shared';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { ParseRpaService } from '../../services/parse/parse-rpa.service';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';
import { RpaContextResolver } from '../../services/rpa-context.resolver';

/**
 * Установка полей RPA из Excel-шаблона.
 *
 * Зеркало `PbxSmartFieldInstallByParseUseCase`: источник — `ParseRpaService`,
 * Bitrix-сторона — `BxTypedEntityFieldsInstallService` (`userfieldconfig` с `moduleId: 'rpa'`),
 * DB-зеркало — `PortalFieldTypedEntityInstallService` с `parent_type = 'rpa'`.
 *
 * Предполагает, что строка `btx_rpas` уже существует — её создаёт оркестратор
 * `InstallRpaUseCase` через `PortalRpaService.upsertFromBitrix` ДО вызова этого use-case-а.
 */
@Injectable()
export class PbxRpaFieldInstallByParseUseCase {
    private readonly logger = new Logger(PbxRpaFieldInstallByParseUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly parseRpaService: ParseRpaService,
        private readonly resolver: RpaContextResolver,
        private readonly portalSync: PortalFieldTypedEntityInstallService,
    ) {}

    async installRpaFields(
        domain: string,
        rpaName: RpaNameEnum,
        group: RpaGroupEnum,
    ): Promise<unknown> {
        const parsed = await this.parseRpaService.getParsedData(rpaName, group);
        const rpa = parsed[0];
        if (!rpa) {
            throw new NotFoundException(
                `No RPA parsed for rpaName=${rpaName} group=${group}`,
            );
        }
        const fields: Field[] = rpa.fields ?? [];
        if (fields.length === 0) {
            return {
                bxResult: null,
                portalFieldEntityInstallResult: [],
                message: 'no fields to install',
            };
        }

        const ctx = await this.resolver.resolve({ domain, rpaName });

        const bxFieldService = new BxTypedEntityFieldsInstallService(
            domain,
            this.pbxService,
            ctx.bxCtx,
            fields,
        );
        const bxResult = await bxFieldService.installFields();
        if (bxResult.countSuccess === 0) {
            throw new Error(
                'В битриксе не удалось изменить ни одного поля RPA',
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
