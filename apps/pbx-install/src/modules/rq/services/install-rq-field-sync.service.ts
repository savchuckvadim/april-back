import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import type { RqFieldTemplate } from '@/apps/rq/install';
import { RqFieldSyncResultDto } from '../dto/rq-response.dto';

/**
 * Установка/синхронизация пользовательских полей реквизита
 * (`crm.requisite.userfield.*`). Сопоставление с существующим полем — по XML_ID.
 * Зеркала в БД нет (поля — install-only).
 */
@Injectable()
export class InstallRqFieldSyncService {
    private readonly logger = new Logger(InstallRqFieldSyncService.name);

    async syncField(
        bitrix: BitrixService,
        tpl: RqFieldTemplate,
    ): Promise<RqFieldSyncResultDto> {
        const list = await bitrix.requisite.getFieldsList({});
        const fields = list.result ?? [];
        const existing = fields.find(f => f.XML_ID === tpl.xmlId);

        const label = { ru: tpl.label };

        if (existing) {
            await bitrix.requisite.updateField(existing.ID, {
                EDIT_FORM_LABEL: label,
                LIST_COLUMN_LABEL: label,
            });
            this.logger.log(`RQ field ${tpl.xmlId} updated id=${existing.ID}`);
            return {
                xmlId: tpl.xmlId,
                fieldId: Number(existing.ID),
                fieldName: existing.FIELD_NAME,
                created: false,
            };
        }

        const addRes = await bitrix.requisite.addField({
            FIELD_NAME: this.buildFieldName(tpl.xmlId),
            USER_TYPE_ID: tpl.userTypeId,
            XML_ID: tpl.xmlId,
            EDIT_FORM_LABEL: label,
            LIST_COLUMN_LABEL: label,
            LIST_FILTER_LABEL: label,
            MULTIPLE: tpl.isMultiple ? 'Y' : 'N',
            MANDATORY: 'N',
            SHOW_FILTER: 'Y',
        });
        const created = addRes.result;
        this.logger.log(`RQ field ${tpl.xmlId} created id=${created?.ID}`);
        return {
            xmlId: tpl.xmlId,
            fieldId: Number(created?.ID),
            fieldName: created?.FIELD_NAME ?? this.buildFieldName(tpl.xmlId),
            created: true,
        };
    }

    /** FIELD_NAME пользовательского поля реквизита (UF_CRM_<XMLID>). */
    private buildFieldName(xmlId: string): string {
        return `UF_CRM_${xmlId.toUpperCase()}`;
    }
}
