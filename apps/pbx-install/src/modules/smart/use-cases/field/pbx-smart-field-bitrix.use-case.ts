import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BxTypedEntityFieldsInstallService } from '@app/pbx-install/shared';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { ParseSmartService } from '../../services/parse/parse-smart.service';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';
import { SmartContextResolver } from '../../services/smart-context.resolver';

/**
 * Установка полей смарта из Excel-шаблона **только в Bitrix** (userfieldconfig.*),
 * без синхронизации с PortalDB. Зеркало
 * {@link PbxSmartFieldInstallByParseUseCase} без шага `portalSync.syncWithDb`.
 */
@Injectable()
export class PbxSmartFieldBitrixUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseSmartService: ParseSmartService,
        private readonly resolver: SmartContextResolver,
    ) {}

    async installFields(
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
            return { bxResult: null, message: 'no fields to install' };
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
        return { bxResult };
    }
}
