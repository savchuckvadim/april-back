/**
 * «Обновить всё по порядку» — сценарий портала в админке (просьба
 * владельца 08.11.2026: «кнопок и очередей переразбора очень много, пока
 * дождёшься результатов, уже забываешь, где что проверить»). Один сценарий
 * на портал: шаги идут друг за другом, каждый следующий — когда закончился
 * предыдущий; состояние в Redis, тик раз в минуту в очереди
 * AI_ANALYTICS_ADMIN (воркер — apps/admin).
 */

/** Шаги сценария в порядке выполнения. */
export const AI_REFRESH_STEP_CODES = [
    'reanalyze',
    'rebuild',
    'cache',
    'forecast',
    'owner-report',
] as const;
export type AiRefreshStepCode = (typeof AI_REFRESH_STEP_CODES)[number];

/** Состояние шага: ждёт, идёт, сделан, пропущен, сорвался. */
export const AI_REFRESH_STEP_STATES = [
    'pending',
    'running',
    'done',
    'skipped',
    'error',
] as const;
export type AiRefreshStepState = (typeof AI_REFRESH_STEP_STATES)[number];

/** Названия шагов для админки. */
export const AI_REFRESH_STEP_TITLES: Record<AiRefreshStepCode, string> = {
    reanalyze: 'Переразбор звонков месяца',
    rebuild: 'Пересчёт месяца: витрина, история стадий, прогноз',
    cache: 'Сброс кэша витрины',
    forecast: 'Прогноз: проверка точности и показ',
    'owner-report': 'Отчёт собственнику: PDF',
};

/** Один шаг сценария. */
export interface AiRefreshStep {
    code: AiRefreshStepCode;
    title: string;
    state: AiRefreshStepState;
    /** Фаза внутри шага (у переразбора: подсчёт → запуск); иначе null. */
    phase: string | null;
    /** Начало текущей фазы, ISO; не начинался — null. */
    startedAt: string | null;
    finishedAt: string | null;
    /** Что происходит или чем кончилось — словами. */
    text: string | null;
}

/** Сценарий портала целиком — то, что лежит в Redis и видит админка. */
export interface AiRefreshScenario {
    id: string;
    domain: string;
    /** Закрытый месяц 'YYYY-MM', который обновляем. */
    monthKey: string;
    /** Первый и последний день месяца 'YYYY-MM-DD' (переразбор). */
    from: string;
    to: string;
    withReanalysis: boolean;
    steps: AiRefreshStep[];
    startedAt: string;
    /** Последний тик, ISO: тики встали — сценарий можно запустить заново. */
    updatedAt: string;
    finished: boolean;
    requestedBy: string | null;
}

/** Данные тика в очереди. */
export interface AiRefreshTickJobData {
    domain: string;
    scenarioId: string;
    /** Номер тика — часть jobId, чтобы Bull не склеил повторы. */
    seq: number;
}

/** Исход старта или проверки шага. */
export interface AiRefreshStepOutcome {
    state: Exclude<AiRefreshStepState, 'pending'>;
    text: string;
    /** Новая фаза шага (с новой меткой начала); нет — фаза та же. */
    phase?: string;
}

/** Константы сценария (процедура, не настройки портала). */
export const AI_REFRESH_DEFAULTS = {
    /** Пауза между тиками. */
    tickDelayMs: 60_000,
    /** Сколько живёт состояние в Redis после последнего тика. */
    stateTtlSeconds: 7 * 24 * 60 * 60,
    /** Тиков нет дольше — сценарий считается брошенным, можно заново. */
    abandonedMs: 15 * 60_000,
    /** Шаг идёт дольше — сорвался (пересчёт месяца ждёт слот до 40 минут). */
    stepTimeoutMs: 8 * 60 * 60_000,
    /** Переразбор без движения дольше — встал (как в сводке запуска). */
    reanalysisStaleMs: 60 * 60_000,
    /** Потолок звонков переразбора без ручного решения. */
    reanalysisMaxCalls: 1500,
} as const;
