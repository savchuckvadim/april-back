import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBXField } from '@/modules/bitrix';
import { PbxEntityType } from '@/shared';
import {
    BxEntityFieldManageService,
    BxEntityFieldsInstallService,
    BxFieldDeleteResult,
    IBxEntityFieldsInstallResult,
} from '../../../shared';
import {
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../../shared/entity/field/parse-entity-field.service';

/** Префикс пользовательских полей CRM-сущностей в Bitrix. */
const CRM_FIELD_PREFIX = 'UF_CRM_';

/**
 * Операции над полями лида **только в живом Bitrix**, без записи в PortalDB.
 * Источник шаблона — Excel (через ParseEntityFieldsService).
 */
@Injectable()
export class PbxLeadFieldBitrixUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseService: ParseEntityFieldsService,
    ) {}

    async listFields(domain: string): Promise<{
        domain: string;
        fields: IBXField[];
    }> {
        const fields = await this.loadBitrixFields(domain);
        return { domain, fields };
    }

    async installFields(
        domain: string,
        group: PbxEntityGroupEnum,
        appName: ParseEntityFieldsAppName,
    ): Promise<IBxEntityFieldsInstallResult> {
        const { fields } = await this.parseService.getParsedData(
            PbxEntityType.LEAD,
            appName,
            group,
        );
        const localParseFields = fields.filter(f => f.isNeedUpdate);
        const service = new BxEntityFieldsInstallService(
            domain,
            this.pbxService,
            'lead',
            localParseFields,
        );
        return service.installBxFields();
    }

    async deleteFields(
        domain: string,
        codes: string[],
    ): Promise<BxFieldDeleteResult[]> {
        const live = await this.loadBitrixFields(domain);
        const bxFieldNames = codes.map(code => {
            const found = live.find(
                f =>
                    f.XML_ID === code ||
                    f.FIELD_NAME === `${CRM_FIELD_PREFIX}${code.toUpperCase()}`,
            );
            return { code, bxFieldName: found?.FIELD_NAME ?? code };
        });
        const service = new BxEntityFieldManageService(
            domain,
            this.pbxService,
            'lead',
        );
        return service.deleteFields(bxFieldNames);
    }

    private async loadBitrixFields(domain: string): Promise<IBXField[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const { result } = await bitrix.lead.getFieldsList();
        return (result ?? []).filter(f =>
            f.FIELD_NAME?.startsWith(CRM_FIELD_PREFIX),
        );
    }
}
