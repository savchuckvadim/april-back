import {
    EnumOrkEventAction,
    EnumOrkEventCommunication,
    EnumOrkEventInitiative,
    EnumOrkFieldCode,
    EnumOrkResultStatus,
} from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';
import { OrkFieldResolver } from '../ork/ork-field.resolver';

/** Параметры построения одного элемента списка ОРК-история. */
export interface IOrkHistoryElementParams {
    /** Заголовок (NAME элемента + поле event_title) */
    name: string;
    /** Код типа события (et_ork_*) */
    eventTypeCode?: string;
    /** Код действия (ea_ork_*) */
    eventActionCode: EnumOrkEventAction;
    /** Код типа коммуникации (ec_ork_*) */
    communicationCode?: EnumOrkEventCommunication;
    /** Код инициативы (ei_ork_*) */
    initiativeCode?: EnumOrkEventInitiative;
    /** Код результативности (ork_result_status) */
    resultStatusCode?: EnumOrkResultStatus;
    responsibleId?: number;
    date: string;
    planDate?: string;
    comment?: string;
    /** Привязки CRM (CO_/D_/C_) */
    crmLinks: string[];
    /** Привязка компании (CO_<id> или массив) */
    companyLink: string | string[];
    contactId?: number;
}

type FieldValue = string | string[] | number;

/**
 * Строит FIELDS для `lists.element.add` элемента ОРК-история по кодам полей и
 * элементов перечислений (без магических строк). Возвращает мапу
 * `bitrixCamelId → значение` + `NAME`.
 */
export class OrkHistoryElementBuilder {
    constructor(private readonly resolver: OrkFieldResolver) {}

    build(params: IOrkHistoryElementParams): Record<string, FieldValue> {
        const fields: Record<string, FieldValue> = { NAME: params.name };

        this.setScalar(fields, EnumOrkFieldCode.event_title, params.name);
        this.setScalar(fields, EnumOrkFieldCode.ork_event_date, params.date);
        this.setScalar(fields, EnumOrkFieldCode.crm, params.crmLinks);
        this.setScalar(
            fields,
            EnumOrkFieldCode.ork_crm_company,
            params.companyLink,
        );

        this.setItem(
            fields,
            EnumOrkFieldCode.ork_event_action,
            params.eventActionCode,
        );
        if (params.eventTypeCode) {
            this.setItem(
                fields,
                EnumOrkFieldCode.ork_event_type,
                params.eventTypeCode,
            );
        }
        if (params.communicationCode) {
            this.setItem(
                fields,
                EnumOrkFieldCode.event_communication,
                params.communicationCode,
            );
        }
        if (params.initiativeCode) {
            this.setItem(
                fields,
                EnumOrkFieldCode.ork_event_initiative,
                params.initiativeCode,
            );
        }
        if (params.resultStatusCode) {
            this.setItem(
                fields,
                EnumOrkFieldCode.ork_result_status,
                params.resultStatusCode,
            );
        }

        if (params.responsibleId) {
            this.setScalar(
                fields,
                EnumOrkFieldCode.responsible,
                params.responsibleId,
            );
            this.setScalar(
                fields,
                EnumOrkFieldCode.author,
                params.responsibleId,
            );
            this.setScalar(fields, EnumOrkFieldCode.su, params.responsibleId);
        }
        if (params.planDate !== undefined) {
            this.setScalar(
                fields,
                EnumOrkFieldCode.ork_plan_date,
                params.planDate,
            );
        }
        if (params.comment !== undefined) {
            this.setScalar(
                fields,
                EnumOrkFieldCode.manager_comment,
                params.comment,
            );
        }
        if (params.contactId) {
            this.setScalar(
                fields,
                EnumOrkFieldCode.ork_crm_contact,
                params.contactId,
            );
        }

        return fields;
    }

    private setScalar(
        fields: Record<string, FieldValue>,
        code: EnumOrkFieldCode,
        value: FieldValue,
    ): void {
        const camelId = this.resolver.camelId(code);
        if (camelId) fields[camelId] = value;
    }

    private setItem(
        fields: Record<string, FieldValue>,
        fieldCode: EnumOrkFieldCode,
        itemCode: string,
    ): void {
        const camelId = this.resolver.camelId(fieldCode);
        const bitrixId = this.resolver.itemBitrixId(fieldCode, itemCode);
        if (camelId && bitrixId !== undefined) {
            fields[camelId] = bitrixId;
        }
    }
}
