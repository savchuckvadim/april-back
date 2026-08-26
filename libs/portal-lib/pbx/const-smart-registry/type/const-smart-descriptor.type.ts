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
    /**
     * Для crm-полей: привязка к сущностям (settings userfieldconfig) —
     * без неё значения ['D_123'] молча не сохраняются.
     */
    crmEntities?: readonly ('LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY')[];
}

/**
 * Стадия воронки const-смарта в установочном контракте pbx-install
 * (структурно совместима со `Stage` из shared/parse-category; локальная
 * копия — portal-lib не импортирует из приложений).
 */
export interface ConstSmartInstallStage {
    id: string;
    /** Пусто в эталоне: entityTypeId появляется после установки типа. */
    entityTypeId: string;
    entityType: string;
    parentType: string;
    type: string;
    group: string;
    name: string;
    title: string;
    /** Суффикс STATUS_ID (`PLAN` → `DT{entityTypeId}_{catId}:PLAN`). */
    bitrixId: string;
    isActive: boolean;
    smartBitrixId: string;
    color: string;
    code: string;
    isNeedUpdate: boolean;
    order: number;
    bitrixEnitiyId: string;
    isDefault: 'Y' | 'N';
    /**
     * Явная семантика стадии (`SEMANTICS` в crm.status.*): 'S' | 'F' | ''.
     * Эвристика по bitrixId (SUCCESS/FAIL) покрывает не все исходы
     * (например NORESULT) — const-конфиг задаёт семантику сам.
     */
    semantics?: 'S' | 'F' | '';
}

/**
 * Воронка const-смарта в установочном контракте pbx-install (структурно
 * совместима с `Category` из shared/parse-category — см. ConstSmartInstallStage).
 */
export interface ConstSmartInstallCategory {
    id: string;
    /** Пусто в эталоне: entityTypeId появляется после установки типа. */
    entityTypeId: string;
    entityType: string;
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
    stages: ConstSmartInstallStage[];
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
    /**
     * Эталонные воронки со стадиями в установочном контракте pbx-install —
     * для const-смартов с hasCategories: true (ЗПР). Ставятся тем же
     * install-smart-categories.service, что и Excel-шаблоны. Отсутствует —
     * смарт без воронок (aicall, skap).
     */
    buildInstallCategories?: () => ConstSmartInstallCategory[];
    /**
     * Родительские сущности типа (crm.type relations.parent, entityTypeId:
     * LEAD=1/DEAL=2/CONTACT=3/COMPANY=4): элементы смарта появляются
     * вкладкой в карточках этих сущностей. По умолчанию установщик ставит
     * только DEAL.
     */
    parentEntityTypeIds?: readonly number[];
    /**
     * Обратные crm-поля на сделке/компании (op_zprs, op_presentations),
     * которые хранят ссылки на элементы этого смарта значением
     * `T{hex(entityTypeId)}_{id}`.
     *
     * Такие поля ставятся установкой ПОЛЕЙ event-sales, когда entityTypeId
     * смарта ещё неизвестен — привязки к динамическому типу у них нет, и
     * Битрикс молча отбрасывает значения `T…_…`. Установщик смарта после
     * создания/резолва типа ДОЛИВАЕТ в settings поля ключ
     * `DYNAMIC_{entityTypeId} = 'Y'` (формат settings crm-поля:
     * LEAD/CONTACT/COMPANY/DEAL/QUOTE/ORDER/SMART_INVOICE/DYNAMIC_* —
     * userfieldconfig.add, apidocs). Поле не установлено — warn и пропуск:
     * повторная установка смарта идемпотентно дольёт.
     */
    backRefFields?: readonly ConstSmartBackRefField[];
}

/** Обратное crm-поле смарта на стандартной сущности CRM. */
export interface ConstSmartBackRefField {
    /** Сущность-владелец поля (entityId userfieldconfig: CRM_DEAL/CRM_COMPANY). */
    entity: 'deal' | 'company';
    /** Полное имя поля (`UF_CRM_*`) — как его ставит установка полей. */
    ufName: string;
}
