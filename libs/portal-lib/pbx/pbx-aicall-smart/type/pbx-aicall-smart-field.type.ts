import {
    CALL_REPORT_SMART_FIELDS,
    CallReportSmartFieldDef,
} from './pbx-aicall-smart.type';

/**
 * Install-ready представление полей смарта «AI-анализ звонков» в формате
 * `Field` установочного контракта pbx-install
 * (shared/parse-field-excel, POST /pbx-smart-field-install/install-fields/).
 * Локальный структурно-совместимый интерфейс: portal-lib не импортирует
 * из приложений.
 */
export interface AicallInstallListItem {
    VALUE: string;
    DEL: string;
    XML_ID: string;
    CODE: string;
    SORT: number;
}

export interface AicallInstallField {
    name: string;
    appType: string;
    type: CallReportSmartFieldDef['type'];
    list: AicallInstallListItem[];
    code: string;
    /** «Сырое» имя поля: префикс UF_CRM_{etid}_ добавит установщик по ctx. */
    bxFieldName: string;
    order: number;
    isNeedUpdate: boolean;
    isMultiple: boolean;
}

export const AICALL_APP_TYPE = 'aicall';

/** Const-конфиг → Field[] установочного контракта (адаптер вместо Excel). */
export function buildAicallInstallFields(): AicallInstallField[] {
    return CALL_REPORT_SMART_FIELDS.map((def, index) => ({
        name: def.name,
        appType: AICALL_APP_TYPE,
        type: def.type,
        code: def.code,
        bxFieldName: def.code,
        order: (index + 1) * 10,
        isNeedUpdate: true,
        isMultiple: def.isMultiple ?? false,
        list: (def.items ?? []).map(item => ({
            VALUE: item.VALUE,
            CODE: item.CODE,
            XML_ID: item.CODE,
            SORT: item.SORT,
            DEL: '',
        })),
    }));
}
