import {
    LLM_FALLBACK_JSON_MODES,
    LLM_FALLBACK_JSON_MODE_DEFAULT,
    LLM_INTEGER_SETTING_RULES,
    type LlmFallbackJsonMode,
    type LlmIntegerSettingKey,
    integerSettingValue,
} from '@lib/vendor-settings';
import type { LlmConcurrencyLimits } from './llm-concurrency.util';

/**
 * Разбор настроек шлюза (11.11.2026 переехали из env в админку — «Настройки
 * приложения», группы «Разборы звонков: …» и «Ключи AI-сервисов»). Значения
 * приходят строками — из админки или из env с тем же именем; здесь они
 * становятся числами и режимами. Диапазоны и значения по умолчанию — в
 * реестре @lib/vendor-settings (LLM_INTEGER_SETTING_RULES): один источник и
 * для проверки при сохранении, и для чтения.
 */

/** Значения настроек по ключу, как их отдаёт читатель; null — не задано. */
export type LlmSettingValues = Readonly<Record<string, string | null>>;

/** Пороги предохранителя поставщиков. */
export interface LlmCircuitOptions {
    /** Сколько временных сбоев в окне ставят поставщика на паузу. */
    failures: number;
    /** Окно счёта сбоев, секунд. */
    windowSec: number;
    /** Длина паузы, секунд. */
    cooldownSec: number;
}

/** Как звать запасной OpenAI-совместимый поставщик. */
export interface LlmFallbackCallSettings {
    jsonMode: LlmFallbackJsonMode;
    /** Сколько ждать ответ, мс. */
    timeoutMs: number;
}

export const LLM_CIRCUIT_SETTING_KEYS = [
    'LLM_CIRCUIT_FAILURES',
    'LLM_CIRCUIT_WINDOW_SEC',
    'LLM_CIRCUIT_COOLDOWN_SEC',
] as const satisfies readonly LlmIntegerSettingKey[];

export const LLM_VIBECODE_CONCURRENCY_SETTING_KEYS = [
    'LLM_VIBECODE_KEY_CONCURRENCY',
    'LLM_VIBECODE_CONCURRENCY',
] as const satisfies readonly LlmIntegerSettingKey[];

export const LLM_FALLBACK_CALL_SETTING_KEYS = [
    'LLM_FALLBACK_JSON_MODE',
    'LLM_FALLBACK_TIMEOUT_MS',
] as const;

const integerOf = (
    values: LlmSettingValues,
    key: LlmIntegerSettingKey,
): number => integerSettingValue(values[key], LLM_INTEGER_SETTING_RULES[key]);

const isJsonMode = (value: string): value is LlmFallbackJsonMode =>
    (LLM_FALLBACK_JSON_MODES as readonly string[]).includes(value);

/** Пороги предохранителя; не задано или мусор — по умолчанию 5 сбоев за 600 с, пауза 300 с. */
export function circuitOptionsOf(values: LlmSettingValues): LlmCircuitOptions {
    return {
        failures: integerOf(values, 'LLM_CIRCUIT_FAILURES'),
        windowSec: integerOf(values, 'LLM_CIRCUIT_WINDOW_SEC'),
        cooldownSec: integerOf(values, 'LLM_CIRCUIT_COOLDOWN_SEC'),
    };
}

/** Пределы одновременных запросов к VibeCode; по умолчанию 6 на ключ портала и 12 всего. */
export function vibecodeConcurrencyOf(
    values: LlmSettingValues,
): LlmConcurrencyLimits {
    return {
        perKey: integerOf(values, 'LLM_VIBECODE_KEY_CONCURRENCY'),
        total: integerOf(values, 'LLM_VIBECODE_CONCURRENCY'),
    };
}

/** Режим JSON и срок ответа запасного поставщика; по умолчанию json_schema и 180 с. */
export function fallbackCallOf(
    values: LlmSettingValues,
): LlmFallbackCallSettings {
    const mode = (values.LLM_FALLBACK_JSON_MODE ?? '').trim();
    return {
        jsonMode: isJsonMode(mode) ? mode : LLM_FALLBACK_JSON_MODE_DEFAULT,
        timeoutMs: integerOf(values, 'LLM_FALLBACK_TIMEOUT_MS'),
    };
}

export const LLM_PROBE_LOCK_SETTING_KEYS = [
    'VIBECODE_ANALYSIS_TIMEOUT_MS',
    'LLM_FALLBACK_TIMEOUT_MS',
] as const satisfies readonly LlmIntegerSettingKey[];

/** Запас замка пробы сверх срока ответа, с: запись в журнал, предохранитель. */
const PROBE_LOCK_MARGIN_SEC = 60;

/**
 * Срок замка пробного вызова, с: самый долгий срок ответа поставщиков плюс
 * минута. Замок берётся у самой отправки, так что проба держит его не
 * дольше ответа; срок нужен, только если процесс упал посреди пробы.
 */
export function probeLockTtlSecOf(values: LlmSettingValues): number {
    const longestMs = Math.max(
        integerOf(values, 'VIBECODE_ANALYSIS_TIMEOUT_MS'),
        integerOf(values, 'LLM_FALLBACK_TIMEOUT_MS'),
    );
    return Math.ceil(longestMs / 1000) + PROBE_LOCK_MARGIN_SEC;
}
