/**
 * Константы месячной портальной модели и шага прогноза (план Фазы 2,
 * поток 16a): коды и ритмы шагов, окно оценки норм, причины пропуска,
 * источники силы усадки и подпись «сезон не оценён».
 *
 * Свой файл констант среза — правило владения общими файлами §1.6 п. 3:
 * `constants/ai-analytics.const.ts` правит только поток настроек,
 * `constants/ai-snapshot.const.ts` — поток конвейера. Магических строк
 * шагов, причин и источников в коде среза нет (ai/rules/pbx-typing.md).
 */
import type { AiPipelineRhythm } from './ai-snapshot.const';

/** Коды шагов среза (уникальны в массиве шагов конвейера). */
export const AI_PORTAL_MODEL_STEP_CODE = 'portal-model' as const;
export const AI_FORECAST_STEP_CODE = 'forecast' as const;

/**
 * Модель портала пересчитывается раз в месяц (3-е число 04:00) и в догоне
 * истории: нормы по 6–12 месяцам не имеет смысла считать каждую ночь, а
 * прогноз читает последнюю записанную модель.
 */
export const AI_PORTAL_MODEL_RHYTHMS = [
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

/** Прогноз пишется каждую ночь: он про сегодняшний остаток месяца. */
export const AI_FORECAST_RHYTHMS = [
    'nightly',
] as const satisfies readonly AiPipelineRhythm[];

/** Окно оценки норм: 12 месяцев назад, включая месяц пересчёта. */
export const AI_PORTAL_MODEL_WINDOW_MONTHS = 12;

/** Минимум месяцев окна, ниже которого κ остаётся настройкой реестра. */
export const AI_PORTAL_MODEL_MIN_MONTHS = 6;

/** Окно опорной оценки S_ref — три последних месяца окна. */
export const AI_PORTAL_SREF_WINDOW_MONTHS = 3;

/** Полоса стажа, по медиане которой берётся S_ref (план §4.3). */
export const AI_PORTAL_SREF_BAND = '6-18' as const;

/** Тип активности, по дневному темпу которого считается потолок `cap`. */
export const AI_PORTAL_CAP_ACTIVITY = 'call' as const;

/** Запасной потолок дневного темпа, если карта реестра молчит. */
export const AI_PORTAL_CAP_FALLBACK = 25;

/**
 * Источник силы усадки κ: `default` — настройка реестра (гибрид
 * 100/30 до гейта), `kleinman` — оценка по методу моментов за гейтом.
 */
export const AI_PORTAL_KAPPA_SOURCES = ['default', 'kleinman'] as const;
export type AiPortalKappaSource = (typeof AI_PORTAL_KAPPA_SOURCES)[number];

/** Как получена опорная оценка S_ref и сезонный индекс. */
export const AI_PORTAL_ESTIMATE_SOURCES = ['estimated', 'default'] as const;
export type AiPortalEstimateSource =
    (typeof AI_PORTAL_ESTIMATE_SOURCES)[number];

/**
 * Сезонный индекс Фазы 2 (план §4.7): истории на оценку сезона нет,
 * поэтому индекс равен единице и едет в витрину С ПОДПИСЬЮ — молчаливая
 * единица читалась бы как «сезонность учтена».
 */
export const AI_PORTAL_SEASON_NOT_ESTIMATED = {
    index: 1,
    source: 'default',
    note: 'Сезонность не оценена: индекс 1,0',
} as const;

/**
 * Причины пропуска и деградации (штатная деградация §5.4): каждая
 * объясняет руководителю, почему записи за период нет или почему в ней
 * стоит прошлая модель.
 */
export const AI_PORTAL_MODEL_REASONS = {
    /** Ростер ОП пуст: считать нечего. */
    rosterEmpty: 'roster-empty',
    /** Месячных снапшотов в окне нет — модель не из чего собрать. */
    monthsMissing: 'portal-model-no-manager-months',
    /** Данных нет: переиспользована прошлая модель портала. */
    reusedPrevious: 'portal-model-reused-previous',
    /** Модели портала нет — прогноз не на чем строить. */
    modelMissing: 'forecast-no-portal-model',
    /** Месяца менеджеров нет — прогноз считать не из чего. */
    monthMissing: 'forecast-no-manager-month',
} as const;
export type AiPortalModelReason =
    (typeof AI_PORTAL_MODEL_REASONS)[keyof typeof AI_PORTAL_MODEL_REASONS];

/** Рычагов в прогнозе дня — столько же, сколько показывает витрина. */
export const AI_FORECAST_LEVER_MAX = 3;

/**
 * Значение из карты реестра «тип:значение» (`cap_level_activity`):
 * 'cold:40,call:25,presentation:3'. Битая карта — запасное значение, а не
 * исключение: опечатка портала не должна ронять ночной конвейер.
 */
export function capFromMap(
    raw: string | undefined,
    key: string,
    fallback: number,
): number {
    for (const chunk of (raw ?? '').split(',')) {
        const [name, value] = chunk.split(':');
        if (name?.trim() === key) {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric;
        }
    }

    return fallback;
}

/**
 * Квантиль нормали для 80 %-интервала (0,9-квантиль). Рычаг объёма
 * выдаётся только с интервалом эффекта (§4.10), а интервал апостериора
 * ребра библиотека строит по переданному z — иначе он был бы 90 %-м.
 */
export const AI_FORECAST_CI80_Z = 1.2816;
