/**
 * МАРШРУТ РАСПОЗНАВАНИЯ ПОРТАЛА — кто переводит запись звонка в текст и в
 * каком порядке (решение владельца 10.11.2026: «в админке надо мочь
 * настраивать, какая для длинных, какая для коротких, какая запасная, какая
 * для увеличения скорости, какая для увеличения точности»).
 *
 * Пять ролей:
 *  - `long`    — длинные звонки (длительность от `longMinSec`);
 *  - `short`   — остальные, короткие;
 *  - `fallbacks` — запасные по порядку: подхватывают, когда основной не
 *    ответил. `null` — запасные по умолчанию (как у режима приложения),
 *    пустой список — запасных нет вовсе;
 *  - `fast`    — «для скорости»;
 *  - `precise` — «для точности».
 * Что из них основное сейчас, решает `priority`: normal — по длительности
 * (long / short), fast и precise — соответствующая роль для ВСЕХ звонков;
 * роль не задана — действует обычная развилка по длительности.
 *
 * `null` в любом поле — «не задано»: действует режим приложения. Маршрут
 * хранится в JSON-колонке настроек AI портала, миграция не нужна.
 */

/**
 * Транскрибаторы — дубль TRANSCRIPTION_PROVIDERS из @lib/call-lib: та
 * библиотека зависит от этой, обратный импорт — цикл. Паритет держит спека
 * роутера транскрибации.
 */
export const AI_TRANSCRIPTION_PROVIDERS = [
    'yandex',
    'bitrix-vibecode',
    'local-whisper',
] as const;
export type AiTranscriptionProvider =
    (typeof AI_TRANSCRIPTION_PROVIDERS)[number];

/** Что сейчас важнее при выборе основного транскрибатора. */
export const AI_TRANSCRIPTION_PRIORITIES = [
    'normal',
    'fast',
    'precise',
] as const;
export type AiTranscriptionPriority =
    (typeof AI_TRANSCRIPTION_PRIORITIES)[number];

/** Границы порога «длинного» звонка, секунд: от полуминуты до двух часов. */
export const AI_TRANSCRIPTION_LONG_MIN_SEC_RANGE = {
    min: 30,
    max: 7200,
} as const;

/** Сколько запасных можно задать: транскрибаторов всего три. */
export const AI_TRANSCRIPTION_MAX_FALLBACKS = 3;

/** Наибольшая длина имени модели в роли. */
export const AI_TRANSCRIPTION_MODEL_MAX_LENGTH = 120;

/** Одна роль маршрута: кто распознаёт и какой моделью. */
export interface AiTranscriptionSlot {
    provider: AiTranscriptionProvider;
    /**
     * Имя модели у этого транскрибатора; null — его модель по умолчанию
     * (у VibeCode — модель транскрибации портала, у Whisper-совместимого
     * сервиса — модель сервиса). У Яндекса модель не выбирается: всегда null.
     */
    model: string | null;
}

export interface PortalTranscriptionRoute {
    /** Порог «длинного» звонка, секунд; null — порог приложения. */
    longMinSec: number | null;
    long: AiTranscriptionSlot | null;
    short: AiTranscriptionSlot | null;
    fallbacks: AiTranscriptionSlot[] | null;
    fast: AiTranscriptionSlot | null;
    precise: AiTranscriptionSlot | null;
    priority: AiTranscriptionPriority | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const isAiTranscriptionProvider = (
    value: unknown,
): value is AiTranscriptionProvider =>
    typeof value === 'string' &&
    (AI_TRANSCRIPTION_PROVIDERS as readonly string[]).includes(value);

export const isAiTranscriptionPriority = (
    value: unknown,
): value is AiTranscriptionPriority =>
    typeof value === 'string' &&
    (AI_TRANSCRIPTION_PRIORITIES as readonly string[]).includes(value);

/** Роль из произвольного значения: незнакомый транскрибатор — роли нет. */
export function normalizeTranscriptionSlot(
    raw: unknown,
): AiTranscriptionSlot | null {
    if (!isRecord(raw) || !isAiTranscriptionProvider(raw.provider)) return null;
    const model =
        typeof raw.model === 'string'
            ? raw.model.trim().slice(0, AI_TRANSCRIPTION_MODEL_MAX_LENGTH)
            : '';
    return {
        provider: raw.provider,
        // Яндекс распознаёт своей моделью — имя из формы ему не передаётся.
        model: raw.provider === 'yandex' || !model ? null : model,
    };
}

const slotKey = (slot: AiTranscriptionSlot): string =>
    `${slot.provider}|${slot.model ?? ''}`;

/** Запасные: только известные роли, без повторов, не больше лимита. */
function normalizeFallbacks(raw: unknown): AiTranscriptionSlot[] | null {
    if (!Array.isArray(raw)) return null;
    const seen = new Set<string>();
    const slots: AiTranscriptionSlot[] = [];
    for (const item of raw) {
        const slot = normalizeTranscriptionSlot(item);
        if (!slot || seen.has(slotKey(slot))) continue;
        seen.add(slotKey(slot));
        slots.push(slot);
        if (slots.length === AI_TRANSCRIPTION_MAX_FALLBACKS) break;
    }
    return slots;
}

function normalizeLongMinSec(raw: unknown): number | null {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    const value = Math.round(raw);
    const { min, max } = AI_TRANSCRIPTION_LONG_MIN_SEC_RANGE;
    return value >= min && value <= max ? value : null;
}

/**
 * Маршрут из JSON настроек или из формы: мусор отбрасывается, а маршрут, в
 * котором не задано ничего, — это `null` (действует режим приложения).
 * Пустой список запасных — осознанное «без запасных», это не «ничего».
 */
export function normalizeTranscriptionRoute(
    raw: unknown,
): PortalTranscriptionRoute | null {
    if (!isRecord(raw)) return null;
    const route: PortalTranscriptionRoute = {
        longMinSec: normalizeLongMinSec(raw.longMinSec),
        long: normalizeTranscriptionSlot(raw.long),
        short: normalizeTranscriptionSlot(raw.short),
        fallbacks: normalizeFallbacks(raw.fallbacks),
        fast: normalizeTranscriptionSlot(raw.fast),
        precise: normalizeTranscriptionSlot(raw.precise),
        priority: isAiTranscriptionPriority(raw.priority) ? raw.priority : null,
    };
    const isEmpty =
        route.longMinSec === null &&
        route.long === null &&
        route.short === null &&
        route.fallbacks === null &&
        route.fast === null &&
        route.precise === null &&
        // «normal» без единой роли ничего не меняет — тоже пусто.
        (route.priority === null || route.priority === 'normal');
    return isEmpty ? null : route;
}
