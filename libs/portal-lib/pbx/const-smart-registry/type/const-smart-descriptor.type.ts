/**
 * Значение enumeration-поля в установочном контракте pbx-install
 * (структурно совместимо с `ListItem` из shared/parse-field-excel;
 * portal-lib не импортирует из приложений — поэтому локальная копия).
 */
export interface ConstSmartInstallListItem {
    VALUE: string;
    DEL: string;
    XML_ID: string;
    CODE: string;
    SORT: number;
}

/**
 * Поле const-смарта в установочном контракте pbx-install (структурно
 * совместимо с `Field` из shared/parse-field-excel).
 */
export interface ConstSmartInstallField {
    name: string;
    appType: string;
    type: string;
    list: ConstSmartInstallListItem[];
    code: string;
    /** «Сырое» имя: префикс UF_CRM_{typeId}_ добавит установщик по ctx. */
    bxFieldName: string;
    order: number;
    isNeedUpdate: boolean;
    isMultiple: boolean;
}

/**
 * Описатель const-смарта (устанавливается из констант, без Excel-шаблона)
 * для реестра галереи смартов в админке.
 *
 * Каждый const-смарт объявляет свой descriptor в СВОЁМ pbx-модуле
 * (например pbx-aicall-smart) и регистрируется одной строкой в
 * CONST_SMART_REGISTRY — карточка в галерее появляется автоматически.
 */
export interface ConstSmartDescriptor {
    /** Ключ установки (маппинг на use-case в ConstSmartInstallerResolver). */
    kind: string;
    /** smarts.type (матчинг с установленной строкой — по паре type+group). */
    type: string;
    /** smarts.group. */
    group: string;
    /** Код смарта в Bitrix: `${type}_${group}`. */
    code: string;
    /** Русское название смарта. */
    title: string;
    /** Число полей по const-конфигу (эталон, не факт установки). */
    fieldsCount: number;
    /** Есть ли у смарта воронки/стадии. */
    hasCategories: boolean;
    /** Короткое описание для карточки галереи. */
    description?: string;
    /**
     * Эталонные поля в установочном контракте pbx-install — благодаря этому
     * const-смарт работает через канонический Excel-flow (шаблон/мониторинг/
     * установка полей/синк выбранных) без собственного дублирующего кода:
     * ParseSmartService подставляет их вместо чтения data.xlsx.
     */
    buildInstallFields: () => ConstSmartInstallField[];
}
