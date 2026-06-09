import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';

/**
 * Стадия RPA-воронки из шаблона.
 * В отличие от CRM-стадий (`crm.status.*`), у RPA-стадии (`rpa.stage.*`) семантика приходит
 * явно из шаблона (`semantic` / `isSuccess` / `isFail`), а идентификатор — `code`/`bitrixId`.
 */
export interface RpaStage {
    id: string;
    name: string;
    title: string;
    bitrixId: string;
    color: string;
    code: string;
    semantic: string;
    isActive: boolean;
    isNeedUpdate: boolean;
    order: number;
    isFirst: boolean;
    isSuccess: boolean;
    isFail: boolean;
}

/** Единственная «категория»/воронка RPA-процесса (в Bitrix её роль играет сам `rpa.type`). */
export interface RpaCategory {
    id: string;
    entityTypeId: string;
    type: string;
    group: string;
    name: string;
    title: string;
    bitrixId: string;
    bitrixCamelId: string;
    code: string;
    isActive: boolean;
    isNeedUpdate: boolean;
    order: number;
    isDefault: boolean;
    stages: RpaStage[];
}

/** Распарсенный RPA-процесс из Excel-шаблона. */
export interface Rpa {
    id: string;
    title: string;
    name: string;
    entityTypeId: string;
    code: string;
    type: string;
    group: string;
    bitrixId: string;
    image: string;
    isActive: boolean;
    isNeedUpdate: boolean;
    order: number;
    /** У RPA ровно одна категория; массив для единообразия с парсингом смарта. */
    categories: RpaCategory[];
    fields: Field[];
}
