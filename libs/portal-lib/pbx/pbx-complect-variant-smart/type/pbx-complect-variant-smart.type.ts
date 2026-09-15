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
 * Жизненный цикл варианта. Полный набор стадий заведён СРАЗУ, чтобы потом не
 * переустанавливать смарт: reconcile при повторной установке доливает новые
 * стадии (`crm.status.add`) и не трогает `STATUS_ID` существующих — элементы на
 * старых стадиях не страдают. Ломает только переименование кода стадии и её
 * удаление, поэтому коды `cvar_draft`/`cvar_current`/`cvar_merged`/
 * `cvar_rejected` зафиксированы навсегда.
 *
 * Смысловые группы:
 *  1. работа в конструкторе — `cvar_draft`, `cvar_current`, `cvar_merged`:
 *     менеджер переключается между вариантами, пока идёт торг;
 *  2. продажа — `cvar_offer` (по варианту сделали КП), `cvar_invoice`
 *     (выставили счёт), `cvar_contract` (договор);
 *  3. поставка — `cvar_supply` (создан отчёт/процесс о поставке),
 *     `cvar_approval` (отчёт есть, приёмка ещё идёт);
 *  4. финал — `cvar_success` ('S', поставка принята), `cvar_rejected` ('F',
 *     менеджер отклонил вариант руками), `cvar_failed` ('F', вариант не доехал
 *     до поставки — «не состоялся»).
 *
 * Порядок важен: успешная стадия перед провальными, провальные — последними по
 * sort. Черновик обязан остаться первым: дефолтная стадия воронки в Битриксе —
 * первая по SORT (`isDefault` в `crm.status.add` не передаётся).
 *
 * КТО СТАВИТ СТАДИИ СЕЙЧАС: `cvar_current`/`cvar_rejected` — кнопки
 * конструктора, `cvar_success`/`cvar_failed` — робот поставки через
 * `ComplectVariantLifecycleService`. Стадии продажи и поставки заведены впрок;
 * кто и когда будет их ставить — расписано в
 * `apps/konstructor/src/modules/complect-variant-lifecycle/README.md`.
 */
export const COMPLECT_VARIANT_SMART_STAGES: readonly ComplectVariantStageDef[] =
    [
        { code: 'cvar_draft', name: 'Черновик', sort: 10, semantics: '' },
        { code: 'cvar_current', name: 'Текущий', sort: 20, semantics: '' },
        { code: 'cvar_merged', name: 'В мердже', sort: 30, semantics: '' },
        { code: 'cvar_offer', name: 'КП', sort: 40, semantics: '' },
        { code: 'cvar_invoice', name: 'Счёт', sort: 50, semantics: '' },
        { code: 'cvar_contract', name: 'Договор', sort: 60, semantics: '' },
        { code: 'cvar_supply', name: 'Поставка', sort: 70, semantics: '' },
        {
            code: 'cvar_approval',
            name: 'Согласование',
            sort: 80,
            semantics: '',
        },
        { code: 'cvar_success', name: 'Успех', sort: 90, semantics: 'S' },
        { code: 'cvar_rejected', name: 'Отклонён', sort: 100, semantics: 'F' },
        {
            code: 'cvar_failed',
            name: 'Не состоялся',
            sort: 110,
            semantics: 'F',
        },
    ];

/**
 * Коды стадий — чтобы не писать строки руками там, где важен смысл.
 *
 * `REJECTED` и `FAILED` — разные вещи, хотя обе провальные: первую ставит
 * человек («этот вариант не берём»), вторую робот («вариант не доехал до
 * поставки»). Различать нужно для разбора: сколько наборов отвалилось по
 * решению клиента, а сколько просто не выбрали.
 */
export const COMPLECT_VARIANT_STAGE = {
    DRAFT: 'cvar_draft',
    CURRENT: 'cvar_current',
    MERGED: 'cvar_merged',
    OFFER: 'cvar_offer',
    INVOICE: 'cvar_invoice',
    CONTRACT: 'cvar_contract',
    SUPPLY: 'cvar_supply',
    APPROVAL: 'cvar_approval',
    SUCCESS: 'cvar_success',
    REJECTED: 'cvar_rejected',
    FAILED: 'cvar_failed',
} as const;

export type ComplectVariantStageCode =
    (typeof COMPLECT_VARIANT_STAGE)[keyof typeof COMPLECT_VARIANT_STAGE];

/**
 * Стадии, после которых вариант закрыт и никуда больше не едет: ни в КП, ни в
 * перенос на сервисную сделку.
 */
export const COMPLECT_VARIANT_FINAL_STAGES: readonly ComplectVariantStageCode[] =
    [
        COMPLECT_VARIANT_STAGE.SUCCESS,
        COMPLECT_VARIANT_STAGE.REJECTED,
        COMPLECT_VARIANT_STAGE.FAILED,
    ];

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

/**
 * Новый `stageId` элемента: у текущего меняется только суффикс после ':'.
 *
 * Префикс `DT{entityTypeId}_{bxCategoryId}` НЕ собираем формулой — id категории
 * на каждом портале свой, а элемент может лежать и не в дефолтной воронке.
 * Берём его из стадии, на которой элемент стоит сейчас: это единственный
 * источник, который точно совпадает с реальностью портала.
 *
 * `null` — у элемента нет стадии (у типа выключены стадии или поле не попало в
 * select): двигать нечего, вызывающий должен молча пропустить элемент.
 */
export const buildComplectVariantStageId = (
    currentStageId: string | null | undefined,
    targetStage: ComplectVariantStageCode,
): string | null => {
    if (!currentStageId || !currentStageId.includes(':')) {
        return null;
    }
    const prefix = currentStageId.slice(0, currentStageId.lastIndexOf(':'));
    if (!prefix) {
        return null;
    }
    return `${prefix}:${complectVariantStageBitrixId(targetStage)}`;
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
