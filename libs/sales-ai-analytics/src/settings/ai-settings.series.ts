/**
 * Сдвиг сравнимой истории при сохранении настроек (план Фазы 2, §2.4).
 *
 * Правило: поле с признаком `breaksSeries` рвёт сопоставимость рядов —
 * `comparableFrom` сдвигается вперёд на дату сохранения, и всё, что было
 * раньше, помечается `confidence: none, reason: 'version-changed'`.
 * Безопасные решения (отсутствия, цели, алерты, гипотеза, подтверждение
 * ростера) историю не рвут — иначе каждая правка отпуска обнуляла бы
 * тренды.
 *
 * Признак берётся из **реестра параметров**, а где кода реестра ещё нет —
 * из явной карты ключей §3.3. Чистые функции: без DI и без «сейчас»
 * внутри (дата сохранения приходит параметром).
 */
import { findParam } from '../params/registry.const';
import { comparableFrom } from '../contracts/versions.types';
import {
    AI_SETTINGS_KEYS,
    type AiPortalEvent,
    type AiSettingsKeyName,
    type AiSettingsRaw,
} from './ai-settings.types';

/** Вид автособытия, которым журнал фиксирует разрыв ряда настройкой. */
export const AI_SETTINGS_BREAK_EVENT = 'settings_break' as const;

/** Одно изменение настройки для аудита: код, было/стало, рвёт ли ряд. */
export interface AiSettingsChange {
    /** Код ключа или поля («ai_analytics_definitions.productiveCall»). */
    code: string;
    before: string;
    after: string;
    breaksSeries: boolean;
}

/**
 * Ключи, у которых разрыв ряда решается целиком (§3.3): потолки
 * оценивания меняют шкалу оценки, остальные девять — нет. Определения и
 * гиперпараметры разбираются по полям, поэтому их здесь нет.
 */
const KEY_BREAKS_SERIES: Readonly<Record<AiSettingsKeyName, boolean>> = {
    levels: false,
    targets: false,
    absences: false,
    modelParams: false,
    managerParams: false,
    definitions: false,
    events: false,
    scoring: true,
    hypothesis: false,
    rosterConfirmedAt: false,
};

/**
 * Поля определений, меняющие смысл события (план §2.1: коды
 * `productive_call_definition`, `presentation_canon`,
 * `min_duration_sec_by_type`, `invoice_nesting`,
 * `call_done_includes_site_come_call`). Остальные поля — разрезы и
 * справочники: они историю не рвут.
 */
const BREAKING_DEFINITION_FIELDS: readonly string[] = [
    'productiveCall',
    'presentationCanon',
    'confirmedOnly',
    'minDurationSecByType',
    'invoiceNesting',
    'callDoneIncludesSiteComeCall',
];

/** Рвёт ли ряд правка поля определений. */
export function definitionFieldBreaksSeries(field: string): boolean {
    return BREAKING_DEFINITION_FIELDS.includes(field);
}

/** Рвёт ли ряд правка кода реестра (источник признака — сам реестр). */
export function paramBreaksSeries(code: string): boolean {
    return findParam(code)?.breaksSeries ?? false;
}

/** JSON-объект строки настройки; битая строка → пустой объект. */
function objectOf(json: string): Readonly<Record<string, unknown>> {
    try {
        const parsed: unknown = json.trim() === '' ? {} : JSON.parse(json);
        return typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)
            ? (parsed as Readonly<Record<string, unknown>>)
            : {};
    } catch {
        return {};
    }
}

/** Стабильное строковое представление значения поля для журнала аудита. */
function show(value: unknown): string {
    return value === undefined ? '' : JSON.stringify(value);
}

/** Пофайловый разбор изменений внутри JSON-объекта ключа. */
function diffObjectKey(
    keyCode: string,
    before: string,
    after: string,
    breaks: (field: string) => boolean,
): AiSettingsChange[] {
    const left = objectOf(before);
    const right = objectOf(after);
    const fields = [
        ...new Set([...Object.keys(left), ...Object.keys(right)]),
    ].sort();
    return fields.flatMap(field => {
        const from = show(left[field]);
        const to = show(right[field]);
        if (from === to) return [];
        return [
            {
                code: `${keyCode}.${field}`,
                before: from,
                after: to,
                breaksSeries: breaks(field),
            },
        ];
    });
}

/** Ключи, которые разбираются по полям, и правило разрыва для поля. */
const FIELD_LEVEL_KEYS: Readonly<
    Partial<Record<AiSettingsKeyName, (field: string) => boolean>>
> = {
    definitions: definitionFieldBreaksSeries,
    modelParams: paramBreaksSeries,
};

/**
 * Что изменилось между двумя наборами сырых значений ключей. Ключи
 * `definitions` и `model_params` разбираются по полям: сдвигать историю
 * из-за правки цвета «горячих» нельзя, а из-за смены порога длительности —
 * обязательно.
 */
export function diffAiSettings(
    before: AiSettingsRaw,
    after: AiSettingsRaw,
): AiSettingsChange[] {
    const names = Object.keys(AI_SETTINGS_KEYS) as AiSettingsKeyName[];
    return names.flatMap(name => {
        const keyCode = AI_SETTINGS_KEYS[name];
        const fromRaw = before[name] ?? '';
        const toRaw = after[name] ?? '';
        if (fromRaw === toRaw) return [];
        const byField = FIELD_LEVEL_KEYS[name];
        if (byField) {
            return diffObjectKey(keyCode, fromRaw, toRaw, byField);
        }
        return [
            {
                code: keyCode,
                before: fromRaw,
                after: toRaw,
                breaksSeries: KEY_BREAKS_SERIES[name],
            },
        ];
    });
}

/**
 * Новая граница сравнимой истории: если хотя бы одно изменение рвёт ряд,
 * `comparableFrom` двигается на дату сохранения; иначе остаётся прежним.
 * Назад граница не едет никогда — история уже разорвана.
 */
export function nextSettingsComparableFrom(
    current: string,
    changes: readonly AiSettingsChange[],
    savedOn: string,
): string {
    const breaking = changes.some(change => change.breaksSeries);
    return breaking ? comparableFrom([current, savedOn]) : current;
}

/**
 * Граница сравнимой истории, накопленная настройками портала: последнее
 * автособытие `settings_break` журнала. Журнал — единственное место, где
 * сдвиг переживает перезапуск: настройки хранят решение, а не его дату.
 */
export function comparableFromEvents(events: readonly AiPortalEvent[]): string {
    return comparableFrom(
        events
            .filter(event => event.kind === AI_SETTINGS_BREAK_EVENT)
            .map(event => event.date),
    );
}

/** Автособытие журнала о разрыве ряда: его дописывает `settings/save`. */
export function settingsBreakEvent(
    day: string,
    codes: readonly string[],
): AiPortalEvent {
    return {
        date: day,
        kind: AI_SETTINGS_BREAK_EVENT,
        note: `Смена настроек, рвущих ряд: ${codes.join(', ')}`,
        source: 'auto',
    };
}
