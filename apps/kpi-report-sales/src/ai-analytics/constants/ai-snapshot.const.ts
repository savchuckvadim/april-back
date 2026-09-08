/**
 * Константы ночного конвейера снапшотов Фазы 2 (план
 * ai/tasks/ai-sales-analytics-phase2-plan.md, поток 12 «p2-pipeline-runner»,
 * разделы 3.1 и 5.3): расписания ритмов, опции Bull-джобы, задержка
 * перекладки при занятом слоте, имена метрик, ключи шины между шагами и
 * детерминированный jobId прогона.
 *
 * Файл отдельный от constants/ai-analytics.const.ts намеренно (правило
 * владения общими файлами §1.6 п. 3): туда пишет только поток настроек.
 * Магических строк ритмов, метрик и ключей шины в коде конвейера нет
 * (ai/rules/pbx-typing.md).
 */
import { shiftDate } from '@lib/sales-ai-analytics';
import { isoWeekKey } from '../domain/loaders/period.util';
import {
    AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX,
    AiAnalyticsSnapshotKind,
} from './ai-analytics.const';

/**
 * Расписания в UTC (контейнер живёт в UTC, как остальные кроны):
 * ежедневный пересчёт — 03:45 МСК (после ночных KPI и до прогрева 05:30),
 * недельный — понедельник 03:15 МСК, месячная заморозка — 3-е число
 * 04:00 МСК, снимок планов руководителя — 1-е число 04:00 МСК
 * (месячный аудит Фазы 0 идёт следом в 04:10, AI_ANALYTICS_AUDIT_CRON).
 */
export const AI_PIPELINE_CRON = {
    NIGHTLY: '45 0 * * *',
    WEEKLY: '15 0 * * 1',
    MONTHLY: '0 1 3 * *',
    PLANS: '0 1 1 * *',
} as const;

/**
 * Опции ночной джобы (план 5.3): приоритет ниже пользовательских (у обзора
 * priority 1, attempts 1 — их эти опции не касаются), две попытки с паузой
 * 5 минут, таймаут 15 минут, короткие хвосты выполненных и упавших джоб.
 */
export const AI_PIPELINE_JOB_OPTIONS = {
    priority: 10,
    attempts: 2,
    backoff: 300_000,
    timeout: 900_000,
    removeOnComplete: 50,
    removeOnFail: 20,
} as const;

/**
 * Backfill (владелец механики — вторая половина потока 12): не больше трёх
 * месяцев за ночь, только в окне 22:00–06:00 по TZ портала, недели режутся
 * лимитом. Вне окна план прогона пуст с причиной.
 */
export const AI_PIPELINE_BACKFILL = {
    maxMonthsPerNight: 3,
    windowFromHour: 22,
    windowToHour: 6,
    weekLimit: 8,
} as const;

/**
 * Слот портала занят — джоба переставляется через минуту, и НИ ОДИН шаг
 * не выполняется (приёмка §6). Ожидание внутри обработчика недопустимо:
 * воркер, стоящий на локе, держал бы место в очереди.
 */
export const AI_PIPELINE_RETRY_DELAY_MS = 60_000;

/** Сколько раз перекладываем джобу, прежде чем сдаться с телеграмом. */
export const AI_PIPELINE_MAX_SLOT_RETRIES = 10;

/** Одновременных прогонов конвейера на портал (лок в Redis). */
export const AI_PIPELINE_MAX_PER_DOMAIN = 1;

/** Ключ сериализации прогонов портала (QueueConcurrencyService.entityKey). */
export const AI_PIPELINE_LOCK_KEY = 'ai-analytics:pipeline' as const;

/** Имена метрик @lib/metrics (план 5.3): низкая кардинальность меток. */
export const AI_PIPELINE_METRIC = {
    jobDuration: 'ai_analytics_job_duration',
    rowsLoaded: 'ai_analytics_rows_loaded',
    bitrixCalls: 'ai_analytics_bitrix_calls',
    llmPrice: 'ai_analytics_llm_price',
} as const;

export const AI_PIPELINE_METRICS = [
    AI_PIPELINE_METRIC.jobDuration,
    AI_PIPELINE_METRIC.rowsLoaded,
    AI_PIPELINE_METRIC.bitrixCalls,
    AI_PIPELINE_METRIC.llmPrice,
] as const;
export type AiPipelineMetricName = (typeof AI_PIPELINE_METRICS)[number];

/** Бакеты длительности прогона, секунды: от быстрого ночного до таймаута. */
export const AI_PIPELINE_DURATION_BUCKETS = [
    1, 5, 15, 30, 60, 120, 300, 600, 900,
] as const;

/**
 * Ритмы конвейера — они же виды снапшот-джобы (новых значений JobNames и
 * видов не заводим, план 1.1): вид едет в payload. `audit` — не ритм
 * конвейера, его обрабатывает AuditSnapshotUseCase Фазы 0.
 */
export const AI_PIPELINE_RHYTHMS = [
    'nightly',
    'weekly',
    'monthly',
    'backfill',
] as const satisfies readonly AiAnalyticsSnapshotKind[];
export type AiPipelineRhythm = (typeof AI_PIPELINE_RHYTHMS)[number];

export function isAiPipelineRhythm(value: unknown): value is AiPipelineRhythm {
    return (
        typeof value === 'string' &&
        (AI_PIPELINE_RHYTHMS as readonly string[]).includes(value)
    );
}

/** Статус прогона: журнальные три плюс «переставлена» (слот занят). */
export const AI_PIPELINE_RUN_STATUSES = [
    'ok',
    'partial',
    'failed',
    'requeued',
] as const;
export type AiPipelineRunStatus = (typeof AI_PIPELINE_RUN_STATUSES)[number];

/**
 * Статусы, попадающие в журнал `ai-analytics-etl-run`: пропуск шага даёт
 * «частично» и конвейер продолжается, падение — «упал» (журнал пишется,
 * исключение пробрасывается, слот освобождается).
 */
export const AI_PIPELINE_JOURNAL_STATUSES = [
    'ok',
    'partial',
    'failed',
] as const satisfies readonly AiPipelineRunStatus[];
export type AiPipelineJournalStatus =
    (typeof AI_PIPELINE_JOURNAL_STATUSES)[number];

/**
 * Ключи шины значений между шагами (план, поток 12). Шаг кладёт результат
 * под своим ключом, следующие читают — прямых зависимостей между шагами
 * нет, поэтому порядок шагов задаётся регистрацией, а не импортами.
 * Новые шаги следующих волн добавляют сюда свои ключи.
 */
export const AI_PIPELINE_BUS_KEYS = {
    callsRows: 'calls.rows',
    kpiMonths: 'kpi.months',
    financeResult: 'finance.result',
    episodes: 'episodes',
    chain: 'chain',
    stageTheta: 'stageTheta',
    cycleMedian: 'cycleMedian',
    slaFacts: 'slaFacts',
    timestampLeak: 'timestampLeak',
    historyMonths: 'historyMonths',
    exposure: 'exposure',
    passport: 'passport',
    /** Снимок планов руководителя на месяц (шаг планов 1-го числа). */
    plans: 'plans',
    portalModel: 'portalModel',
    /** Профили стиля менеджеров за месячное окно (шаг стиля). */
    style: 'style',
} as const;
export type AiPipelineBusKey =
    (typeof AI_PIPELINE_BUS_KEYS)[keyof typeof AI_PIPELINE_BUS_KEYS];

/**
 * Коды шагов, известные ядру: `context` — синтетический шаг журнала, когда
 * упал сбор контекста (настройки/ростер портала), `plans` — снимок планов
 * руководителя 1-го числа (владелец шага — поток паспорта менеджера).
 * Остальные коды объявляют свои срезы.
 */
export const AI_PIPELINE_CORE_STEP_CODES = {
    context: 'context',
    plans: 'plans',
} as const;

/** Фильтр шагов тика «снимок планов»: только шаг планов. */
export const AI_PIPELINE_PLANS_STEPS = [
    AI_PIPELINE_CORE_STEP_CODES.plans,
] as const;

/**
 * Префикс ключа джобы снимка планов. Отдельное пространство ключей нужно,
 * потому что снимок 1-го числа идёт ритмом `monthly` за ТЕКУЩИЙ месяц, а
 * заморозка 3-го числа — за предыдущий: без префикса jobId снимка планов
 * за YYYY-MM столкнулся бы с заморозкой того же месяца тремя днями позже
 * в следующем месяце.
 */
export const AI_PIPELINE_PLANS_KEY_PREFIX = 'plans-' as const;

/** Ключи периодов одного прогона в TZ портала. */
export interface AiPipelinePeriodKeys {
    /** День прогона 'YYYY-MM-DD'. */
    day: string;
    /** ISO-неделя 'YYYY-Www'. */
    weekKey: string;
    /** Месяц 'YYYY-MM'. */
    monthKey: string;
}

/** Месяц, предшествующий дню: 'YYYY-MM-DD' → 'YYYY-MM'. */
export function previousMonthKey(day: string): string {
    return shiftDate(`${day.slice(0, 7)}-01`, -1).slice(0, 7);
}

/**
 * Ключи периодов ритма по дню прогона: недельный ритм считает ЗАКОНЧИВШУЮСЯ
 * неделю (понедельник смотрит на вчера), месячный — закрытый предыдущий
 * месяц (заморозка 3-го числа), остальные — текущие период и месяц.
 */
export function resolvePipelineKeys(
    rhythm: AiPipelineRhythm,
    day: string,
): AiPipelinePeriodKeys {
    return {
        day,
        weekKey: isoWeekKey(rhythm === 'weekly' ? shiftDate(day, -1) : day),
        monthKey:
            rhythm === 'monthly' ? previousMonthKey(day) : day.slice(0, 7),
    };
}

/**
 * jobId прогона: 'ai-analytics:snapshot:{rhythm}:{domain}:{key}'. Bull
 * молча игнорирует повтор существующего id — повторный тик за ту же дату
 * джобу не дублирует, поэтому шаги обязаны быть идемпотентны.
 */
export function buildPipelineJobId(
    rhythm: AiPipelineRhythm,
    domain: string,
    key: string,
): string {
    return `${AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX}:${rhythm}:${domain}:${key}`;
}
