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
}
