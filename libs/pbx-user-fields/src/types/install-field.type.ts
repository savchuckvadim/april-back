/**
 * Типы описания устанавливаемого UF-поля Bitrix (перенесены из
 * apps/pbx-install/src/modules/shared/parse-field-excel — старый путь
 * реэкспортирует отсюда). Либа общая: pbx-install (полная инсталляция
 * портала) и kpi-report-sales (планы — установка полей находу).
 */
import { PbxSalesEventFieldType } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { PbxSalesKonstructorFieldType } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';

/**
 * Тип устанавливаемого поля. Помимо типов из реестров портала
 * поддерживается 'file': поля-файлы (договор, скан) приходят из
 * Excel-шаблонов установки и в реестрах не описаны, но Bitrix такой
 * пользовательский тип принимает (боевой кейс 27.08.2026 — установка
 * полей сделки падала с 400 на «Текущий договор»).
 */
export type FieldType =
    | PbxSalesEventFieldType
    | PbxSalesKonstructorFieldType
    | 'file';

export interface ListItem {
    VALUE: string;
    DEL: string;
    XML_ID: string;
    CODE: string;
    SORT: number;
}

export interface Field {
    name: string;
    appType: string;
    type: FieldType;
    list: ListItem[];
    code: string;
    bxFieldName: string;
    order: number;
    isNeedUpdate: boolean;
    isMultiple: boolean;
    /**
     * Для crm-полей: привязка к сущностям (settings в userfieldconfig).
     * Без неё Bitrix создаёт crm-поле без привязок и значения ['D_123']
     * молча не сохраняются. Excel-парсер поле не заполняет (undefined);
     * источник — const-конфиги (ConstSmartInstallField).
     */
    crmEntities?: readonly ('LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY')[];
}
