import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BxTypedEntityFieldsInstallService } from '@app/pbx-install/shared';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { ParseRpaService } from '../../services/parse/parse-rpa.service';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';
import { RpaContextResolver } from '../../services/rpa-context.resolver';

/**
 * Установка полей RPA из Excel-шаблона **только в Bitrix** (userfieldconfig.*),
 * без синхронизации с PortalDB. Зеркало
 * {@link PbxRpaFieldInstallByParseUseCase} без шага `portalSync.syncWithDb`.
 */
@Injectable()
export class PbxRpaFieldBitrixUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseRpaService: ParseRpaService,
        private readonly resolver: RpaContextResolver,
    ) {}

    async installFields(
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
            return { bxResult: null, message: 'no fields to install' };
        }

        const ctx = await this.resolver.resolve({ domain, rpaName });

        const bxFieldService = new BxTypedEntityFieldsInstallService(
            domain,
            this.pbxService,
            ctx.bxCtx,
            fields,
        );
        const bxResult = await bxFieldService.installFields();
        return { bxResult };
    }
}
