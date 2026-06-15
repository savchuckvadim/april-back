import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBXField } from '@/modules/bitrix';
import { PbxEntityType } from '@/shared';
import {
    BxEntityFieldManageService,
    BxEntityFieldsInstallService,
    BxFieldDeleteResult,
    IBxEntityFieldsInstallResult,
} from '../../shared';
import {
    ParseEntityFieldsAppName,
    ParseEntityFieldsService,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';

/** Префикс пользовательских полей CRM-сущностей в Bitrix. */
const CRM_FIELD_PREFIX = 'UF_CRM_';

/**
 * Операции над полями компании **только в живом Bitrix**, без записи в PortalDB.
 * Источник шаблона — Excel (через ParseEntityFieldsService).
 *
 * `@Injectable`, но Bitrix-инстанс не хранится в `this` (правило CLAUDE.md про
 * race condition): сущность-специфичные сервисы создаются через `new`.
 */
@Injectable()
export class PbxCompanyBitrixUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly parseService: ParseEntityFieldsService,
    ) {}

    /** Живые UF_CRM_-поля компании из Bitrix. */
    async listFields(domain: string): Promise<{
        domain: string;
        fields: IBXField[];
    }> {
        const fields = await this.loadBitrixFields(domain);
        return { domain, fields };
    }

    /** Устанавливает/обновляет поля из Excel-шаблона только в Bitrix. */
    async installFields(
        domain: string,
        group: PbxEntityGroupEnum,
        appName: ParseEntityFieldsAppName,
    ): Promise<IBxEntityFieldsInstallResult> {
        const { fields } = await this.parseService.getParsedData(
            PbxEntityType.BTX_COMPANY,
            appName,
            group,
        );
        const localParseFields = fields.filter(f => f.isNeedUpdate);
        const service = new BxEntityFieldsInstallService(
            domain,
            this.pbxService,
            'company',
            localParseFields,
        );
        return service.installBxFields();
    }

    /** Удаляет поля по списку code только в Bitrix (имя резолвится из живого Bitrix). */
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
            'company',
        );
        return service.deleteFields(bxFieldNames);
    }

    private async loadBitrixFields(domain: string): Promise<IBXField[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const { result } = await bitrix.company.getFieldsList();
        return (result ?? []).filter(f =>
            f.FIELD_NAME?.startsWith(CRM_FIELD_PREFIX),
        );
    }
}
