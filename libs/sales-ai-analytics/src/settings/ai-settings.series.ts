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
 * Признак берётся **только из реестра параметров**: каждому ключу схемы и
 * каждому полю определений сопоставлены коды реестра, а ручной таблицы
 * «ключ → рвёт/не рвёт» нет. Чистые функции: без DI и без «сейчас»
 * внутри (дата сохранения приходит параметром).
 */
import {
    breakingParamCodes,
    nextComparableFrom,
} from '../params/params-version';
import type { AiAnalyticsParamCode } from '../params/registry.const';
import { comparableFrom } from '../contracts/versions.types';
import {
    AI_SETTINGS_KEYS,
    type AiPortalEvent,
    type AiSettingsKeyName,
    type AiSettingsRaw,
} from './ai-settings.types';
import { AI_DEFINITION_PARAM_CODES } from './registry-context.builder';

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
 * Коды реестра, которыми ключ схемы решается целиком (§3.3): ключ рвёт ряд,
 * если рвёт хотя бы один из его кодов. Определения и гиперпараметры
 * разбираются по полям (`FIELD_LEVEL_KEYS`), поэтому их списки пусты.
 */
export const AI_SETTINGS_KEY_PARAM_CODES: Readonly<
    Record<AiSettingsKeyName, readonly AiAnalyticsParamCode[]>
> = {
    levels: ['level', 'since'],
    targets: [
        'target_sales_by_level',
        'training_min_presentations',
        'cap_cold',
    ],
    absences: ['absences'],
    modelParams: [],
    managerParams: [
        'fte_share',
        'absences',
        'target_override',
        'training_min_presentations',
        'exclude_from_norms',
        'workweek',
        'time_zone',
    ],
    definitions: [],
    events: ['portal_events'],
    scoring: ['scoring_caps', 'scoring_stop_words', 'scoring_applicability'],
    hypothesis: ['portal_quality_hypothesis'],
    rosterConfirmedAt: ['roster_confirm_required'],
};

/** Рвёт ли ряд правка ключа целиком (по кодам реестра ключа). */
export function keyBreaksSeries(name: AiSettingsKeyName): boolean {
    return breakingParamCodes(AI_SETTINGS_KEY_PARAM_CODES[name]).length > 0;
}

const DEFINITION_FIELDS: readonly string[] = Object.keys(
    AI_DEFINITION_PARAM_CODES,
);

const isDefinitionField = (
    field: string,
): field is keyof typeof AI_DEFINITION_PARAM_CODES =>
    DEFINITION_FIELDS.includes(field);

/** Рвёт ли ряд правка поля определений (через код реестра поля). */
export function definitionFieldBreaksSeries(field: string): boolean {
    return (
        isDefinitionField(field) &&
        paramBreaksSeries(AI_DEFINITION_PARAM_CODES[field])
    );
}

/** Рвёт ли ряд правка кода реестра (источник признака — сам реестр). */
export function paramBreaksSeries(code: string): boolean {
    return breakingParamCodes([code]).length > 0;
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
                breaksSeries: keyBreaksSeries(name),
            },
        ];
    });
}

/**
 * Новая граница сравнимой истории: если хотя бы одно изменение рвёт ряд,
 * `comparableFrom` двигается на дату сохранения; иначе остаётся прежним.
 * Назад граница не едет никогда — история уже разорвана. То же правило
 * для кодов реестра — `nextComparableFrom` в `params/params-version.ts`.
 */
export function nextSettingsComparableFrom(
    current: string,
    changes: readonly AiSettingsChange[],
    savedOn: string,
): string {
    const breaking = changes.some(change => change.breaksSeries);
    return breaking ? comparableFrom([current, savedOn]) : current;
}

/** Граница после смены кодов реестра `ai_analytics_model_params`. */
export const nextParamsComparableFrom = nextComparableFrom;

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
