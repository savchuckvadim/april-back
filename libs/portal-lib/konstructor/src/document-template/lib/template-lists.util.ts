import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

const CLIENT_TYPES = Object.values(ClientTypeEnum);
const SUPPLY_TYPES = Object.values(SupplyTypeEnum);

/**
 * JSON-массив из LongText-колонки либо undefined. Никогда не кидает.
 *
 * Семантика повторяет `parseJsonValue`/`asSubsetOf` из
 * `libs/sales-ai-analytics/src/settings/ai-settings.json.ts` — проверенный
 * в проекте приём. Реализация здесь СВОЯ намеренно: тащить в резолвер
 * шаблонов зависимость от библиотеки AI-аналитики — неуместная связность,
 * а общего хелпера в `libs/core` на момент написания нет.
 */
function parseJsonArray(raw: unknown): readonly unknown[] {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Подмножество справочника без дублей; пустой результат → null. */
function asSubset<T extends string>(
    raw: unknown,
    allowed: readonly T[],
): T[] | null {
    const kept = parseJsonArray(raw).filter(
        (item): item is T =>
            typeof item === 'string' &&
            (allowed as readonly string[]).includes(item),
    );
    const unique = [...new Set(kept)];
    return unique.length > 0 ? unique : null;
}

/**
 * Разбор JSON-списка признаков из LongText-колонки.
 *
 * Контракт — НИКОГДА не кидать: одна битая строка в БД не должна ронять
 * ни генерацию документа, ни список шаблонов в админке. Невалидный JSON,
 * не-массив, пустой массив и массив из одних незнакомых кодов — всё
 * сводится к `null`, то есть «годится любому».
 *
 * ВАЖНО про fail-open. `null` = «любой», поэтому отбрасывание неизвестного
 * кода РАСШИРЯЕТ область применения шаблона: строка, задуманная только под
 * `advokat`, при неизвестном коде начнёт подходить всем. Поэтому:
 *  - вызывающий код логирует предупреждение, когда разбор что-то отбросил
 *    (для этого есть `parseTemplateListStrict`);
 *  - CRUD обязан валидировать коды НА ЗАПИСИ, чтобы в эту ветку попадали
 *    только легаси-строки, а не свежий ввод администратора.
 *
 * Пустой массив `[]` намеренно приравнен к `null`: схема описывает контракт
 * как «NULL — для любого», про `[]` не говорит ничего, а трактовка
 * «`[]` не подходит никому» создала бы навсегда недостижимую строку —
 * чего администратор точно не имел в виду. Для состояния «черновик, не
 * настроено» есть `is_active = false`.
 */
export function parseClientTypes(raw: unknown): ClientTypeEnum[] | null {
    return asSubset(raw, CLIENT_TYPES);
}

export function parseSupplyTypes(raw: unknown): SupplyTypeEnum[] | null {
    return asSubset(raw, SUPPLY_TYPES);
}

/**
 * То же, но сообщает, были ли отброшены значения — чтобы вызывающий
 * залогировал fail-open на конкретной строке.
 */
export function parseTemplateListStrict<T extends string>(
    raw: unknown,
    allowed: readonly T[],
): { list: T[] | null; dropped: boolean } {
    const source = parseJsonArray(raw);
    const list = asSubset(raw, allowed);
    return { list, dropped: source.length > (list?.length ?? 0) };
}

/**
 * Сериализация обратно в LongText. Пустой список и `undefined` пишутся как
 * `null`, чтобы в БД не появлялось `"[]"` — см. рассуждение о `[]` выше.
 */
export function serializeTemplateList(
    list: readonly string[] | null | undefined,
): string | null {
    if (!list || list.length === 0) {
        return null;
    }
    return JSON.stringify([...new Set(list)]);
}

/**
 * Подходит ли список под запрошенное значение.
 *
 * `null` (годится любому) подходит всегда. Если значение признака не
 * передано, считаем, что подходит только «любой»: иначе шаблон под
 * конкретный тип выиграл бы у универсального, не имея на это оснований.
 */
export function listMatches<T extends string>(
    list: readonly T[] | null,
    value: T | null | undefined,
): boolean {
    if (list === null) {
        return true;
    }
    return value != null && list.includes(value);
}
