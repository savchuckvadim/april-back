import {
    PBX_SALES_KONSTRUCTOR_FIELDS,
    PbxSalesKonstructorField,
} from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';

/**
 * Const-описание смарт-процесса «Варианты комплекта» (complect_variant).
 *
 * Один элемент = ОДИН собранный в конструкторе вариант предложения: комплект,
 * дополнения, ЛТ, академия — всё, что помещается в одну сделку. Вариантов на
 * сделке может быть несколько: менеджер собирает их как альтернативы, потом
 * оставляет один либо сливает несколько в общий «мегакомплект» под один
 * договор.
 *
 * ОТЛИЧИЕ ОТ `service_offer`: тот — временное хранилище данных БУДУЩЕЙ сделки.
 * У клиента есть действующая сделка со своим комплектом и ценой; пока идёт
 * обсуждение следующего периода, новые цифры нельзя писать в неё — затрутся
 * актуальные данные по договору. Поэтому «предложение на будущий период» живёт
 * отдельным элементом, ровно одним на сделку, и после перезаключения робот
 * вместе с данными RPA создаёт из него новую сервисную сделку.
 *
 * Здесь задача другая: несколько предложений внутри ОДНОЙ сделки — запомнить
 * варианты, пока клиент выбирает, и прикрепить наборы, которые могут пойти
 * одним договором или разными. Поэтому отдельный тип, а не расширение старого.
 * Полная картина и незакрытые вопросы — в README модуля.
 *
 * ПОЛЯ — зеркало konstructor-полей сделки: вариант хранит то же, что сделка,
 * и печатается теми же шаблонами. Состав НЕ дублируется руками, а выводится из
 * канона `PBX_SALES_KONSTRUCTOR_FIELDS`: иначе две копии списка неизбежно
 * разъедутся.
 */

/** Типы полей повторяют PortalFieldType (mapFieldTypeToBitrixType). */
export type ComplectVariantFieldType =
    | 'string'
    | 'integer'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'enumeration'
    | 'employee'
    | 'crm';

export interface ComplectVariantSmartFieldDef {
    /** Код поля: суффикс UF-имени (UF_CRM_{typeId}_{code}) и xmlId. UPPER_SNAKE. */
    code: string;
    name: string;
    type: ComplectVariantFieldType;
    isMultiple?: boolean;
}

export const COMPLECT_VARIANT_SMART_TYPE = 'complect_variant';
export const COMPLECT_VARIANT_SMART_GROUP = 'sales';
/** Ключ идемпотентности установки — менять только с переустановкой везде. */
export const COMPLECT_VARIANT_SMART_CODE = `${COMPLECT_VARIANT_SMART_TYPE}_${COMPLECT_VARIANT_SMART_GROUP}`;
export const COMPLECT_VARIANT_SMART_TITLE = 'Варианты комплекта';

// ---------------------------------------------------------------------------
// Стадии = статус варианта
// ---------------------------------------------------------------------------

export interface ComplectVariantStageDef {
    code: string;
    name: string;
    sort: number;
    /** Семантика для crm.status: 'S' успех, 'F' провал, '' нейтральная. */
    semantics?: 'S' | 'F' | '';
}

/**
 * Жизненный цикл варианта: черновик → либо становится текущим, либо уходит в
 * мердж, либо отклоняется. «Текущий» и «В мердже» — не финальные стадии:
 * менеджер переключается между вариантами, пока идёт торг.
 */
export const COMPLECT_VARIANT_SMART_STAGES: readonly ComplectVariantStageDef[] =
    [
        { code: 'cvar_draft', name: 'Черновик', sort: 10, semantics: '' },
        { code: 'cvar_current', name: 'Текущий', sort: 20, semantics: '' },
        { code: 'cvar_merged', name: 'В мердже', sort: 30, semantics: '' },
        { code: 'cvar_rejected', name: 'Отклонён', sort: 40, semantics: 'F' },
    ];

/** Коды стадий — чтобы не писать строки руками там, где важен смысл. */
export const COMPLECT_VARIANT_STAGE = {
    DRAFT: 'cvar_draft',
    CURRENT: 'cvar_current',
    MERGED: 'cvar_merged',
    REJECTED: 'cvar_rejected',
} as const;

export type ComplectVariantStageCode =
    (typeof COMPLECT_VARIANT_STAGE)[keyof typeof COMPLECT_VARIANT_STAGE];

/** Суффикс STATUS_ID: DT{entityTypeId}_{catId}:{SUFFIX}. */
export const complectVariantStageBitrixId = (stageCode: string): string =>
    stageCode.replace(/^cvar_/, '').toUpperCase();

/**
 * Код стадии по `stageId` элемента (`DT1046_1:CURRENT` → `cvar_current`).
 *
 * Стадия — признак участия варианта: её видно колонкой канбана, она переживает
 * перезагрузку конструктора и переезжает вместе с элементом. Чужая или пустая
 * стадия даёт `null` — вариант считается обычным черновиком.
 */
export const resolveComplectVariantStageCode = (
    stageId: string | null | undefined,
): ComplectVariantStageCode | null => {
    if (!stageId) {
        return null;
    }
    const suffix = stageId.split(':').pop()?.toUpperCase();
    if (!suffix) {
        return null;
    }
    const stage = COMPLECT_VARIANT_SMART_STAGES.find(
        item => complectVariantStageBitrixId(item.code) === suffix,
    );
    return (stage?.code as ComplectVariantStageCode) ?? null;
};

// ---------------------------------------------------------------------------
// Поля
// ---------------------------------------------------------------------------

/** Типы канона, которые смарт умеет принимать как есть. */
const CANON_TYPE_MAP: Record<string, ComplectVariantFieldType> = {
    string: 'string',
    integer: 'integer',
    date: 'date',
    datetime: 'datetime',
    // «множественное» в каноне — это строковый список значений
    multiple: 'string',
    enumeration: 'enumeration',
};

/**
 * UF-суффикс поля на смарте. В каноне колонка `smart` заполнена не у всех
 * konstructor-полей (исторически смарт ставился Excel-шаблоном с урезанным
 * составом) — там, где пусто, берём код в UPPER_SNAKE.
 */
const toSmartFieldCode = (field: PbxSalesKonstructorField): string =>
    field.smart ? field.smart : field.code.toUpperCase();

/**
 * Поля варианта = konstructor-поля сделки. Дубли по UF-суффиксу отбрасываем:
 * один код канона может означать два поля СДЕЛКИ (`consalting` — описание и
 * продуктовое поле), но на смарте им нужен разный суффикс, и до появления
 * второго суффикса в каноне честнее поставить одно поле, чем угадывать.
 */
const buildFieldsFromCanon = (): ComplectVariantSmartFieldDef[] => {
    const seen = new Set<string>();
    const fields: ComplectVariantSmartFieldDef[] = [];

    for (const canonField of PBX_SALES_KONSTRUCTOR_FIELDS) {
        const type = CANON_TYPE_MAP[canonField.type];
        if (!type) {
            continue;
        }
        const code = toSmartFieldCode(canonField);
        if (seen.has(code)) {
            continue;
        }
        seen.add(code);
        fields.push({
            code,
            name: canonField.name,
            type,
            isMultiple: canonField.type === 'multiple',
        });
    }

    return fields;
};

/** Служебные поля самого варианта — их в сделке нет. */
const VARIANT_OWN_FIELDS: readonly ComplectVariantSmartFieldDef[] = [
    {
        code: 'VARIANT_NAME',
        name: 'Название варианта',
        type: 'string',
    },
    {
        code: 'VARIANT_COMMENT',
        name: 'Комментарий к варианту',
        type: 'string',
    },
    {
        // Из каких вариантов собран мегакомплект. Хранит id элементов этого же
        // смарта — «помнить, какие вошли в мердж».
        code: 'VARIANT_SOURCE_IDS',
        name: 'Собран из вариантов',
        type: 'string',
        isMultiple: true,
    },
];

export const COMPLECT_VARIANT_SMART_FIELDS: readonly ComplectVariantSmartFieldDef[] =
    [...VARIANT_OWN_FIELDS, ...buildFieldsFromCanon()];

/**
 * Формульный camel-ключ поля для `crm.item.*`: `ufCrm{typeId}{Pascal}`.
 * Факт берётся из `crm.item.fields` — формула не всегда совпадает с
 * реальностью (боевой инцидент `UF_CRM_94_TRANSCRIPT_1`), поэтому это только
 * fallback.
 */
export function buildComplectVariantItemFieldName(
    typeId: number | string,
    code: string,
): string {
    const pascal = code
        .toLowerCase()
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return `ufCrm${typeId}${pascal}`;
}
