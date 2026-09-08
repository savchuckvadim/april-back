/**
 * Контракт шага ночного конвейера (план Фазы 2, поток 12): контекст
 * прогона, шина значений между шагами, результат шага и DI-токен массива
 * шагов.
 *
 * ⚠ ИДЕМПОТЕНТНОСТЬ ОБЯЗАТЕЛЬНА. jobId прогона детерминирован
 * (buildPipelineJobId), а Bull МОЛЧА игнорирует повтор существующего id —
 * значит, один и тот же прогон может как не случиться дважды, так и
 * случиться (ретрай, ручной перезапуск, backfill). Шаг обязан приводить
 * состояние к одному результату при повторе за ту же дату: писать
 * снапшоты через AiAnalyticsSnapshotStore.upsert (прошлая запись ключа
 * уходит в superseded), не накапливать счётчики и не слать пуши.
 *
 * ⚠ Раннер НЕ импортирует шаги напрямую: они инжектятся токеном
 * AI_ANALYTICS_PIPELINE_STEPS, иначе конвейер и срезы (kpi, финансы,
 * история стадий, модель портала) получили бы циклические зависимости.
 * Массив собирает поток сборки, регистрируя шаги своих модулей.
 */
import type { JobOptions } from 'bull';
import type {
    AiAnalyticsEtlStepStatus,
    WorkCalendar,
} from '@lib/sales-ai-analytics';
import type { ParamContext } from '@lib/sales-ai-analytics/params/index';
import type {
    AiPipelineBusKey,
    AiPipelineRhythm,
} from '../constants/ai-snapshot.const';
import type { AiAnalyticsPortalSettings } from '../domain/loaders/settings.loader';
import type {
    AiPipelineRunSummary,
    AiSnapshotJobData,
} from '../dto/ai-snapshot.dto';
import { snapshotHashKey } from '../store/snapshot-serialize.util';

/** DI-токен массива шагов конвейера (провайдер — модуль конвейера). */
export const AI_ANALYTICS_PIPELINE_STEPS = 'AI_ANALYTICS_PIPELINE_STEPS';

/** DI-токен раннера конвейера (нужен процессору без импорта класса). */
export const AI_ANALYTICS_SNAPSHOT_RUNNER = 'AI_ANALYTICS_SNAPSHOT_RUNNER';

/**
 * Контекст прогона: всё, что шагу нужно знать о портале и периоде. Собран
 * раннером один раз за прогон — шаги не читают настройки и ростер сами.
 */
export interface AiPipelineStepContext {
    domain: string;
    rhythm: AiPipelineRhythm;
    /** День прогона 'YYYY-MM-DD' в TZ портала. */
    day: string;
    /** ISO-неделя расчёта 'YYYY-Www' (недельный ритм — закончившаяся). */
    weekKey: string;
    /** Месяц расчёта 'YYYY-MM' (месячный ритм — закрытый предыдущий). */
    monthKey: string;
    /** IANA-зона портала (дубль calendar.timeZone для краткости шагов). */
    timeZone: string;
    /** Производственный календарь портала: праздники и рабочая неделя. */
    calendar: WorkCalendar;
    /** Настройки портала (десять ключей [kpiSales] в разобранном виде). */
    settings: AiAnalyticsPortalSettings;
    /** Слои реестра параметров: менеджер → полоса стажа → портал. */
    registry: ParamContext;
    /** sha256 эффективных настроек всех слоёв (в конверт снапшота). */
    paramsVersion: string;
    /** Версия кода расчёта (колонка model записи ais). */
    calcVersion: string;
    /** Начало сравнимой истории 'YYYY-MM-DD'; '' — ряд не рвался. */
    comparableFrom: string;
    /** Хэш входов прогона: его смена — признак дрейфа в журнале. */
    inputsHash: string;
    /** Ростер ОП, Bitrix-id (в конверте снапшота менеджер — строкой). */
    managerIds: readonly number[];
    /** Момент запуска прогона (время параметром, не new Date() в шагах). */
    now: Date;
    /** Перезаписать кэш и снапшоты, даже если они уже есть. */
    forceRefresh: boolean;
}

/**
 * Хэш входов прогона: домен, ритм, ключи периода, версии, граница
 * сравнимости, ростер и календарь. Его смена — дрейф входов в журнале
 * и повод пересчитать снапшоты периода.
 */
export function buildInputsHash(
    ctx: Omit<AiPipelineStepContext, 'inputsHash'>,
): string {
    const cal = ctx.calendar;
    return snapshotHashKey([
        `${ctx.domain}|${ctx.rhythm}|${ctx.day}|${ctx.weekKey}|${ctx.monthKey}`,
        `${ctx.calcVersion}|${ctx.paramsVersion}|${ctx.comparableFrom}`,
        ctx.managerIds.join(','),
        `${cal.timeZone}|${cal.holidays.join(',')}|${cal.workweek.join('')}`,
    ]);
}

/**
 * Шина значений между шагами: тяжёлая выборка делается один раз и
 * переиспользуется соседними шагами. Ключи — только из
 * AI_PIPELINE_BUS_KEYS (без магических строк).
 */
export interface StepBus {
    get<T>(key: AiPipelineBusKey): T | undefined;
    set<T>(key: AiPipelineBusKey, value: T): void;
}

/** Шина поверх Map: живёт один прогон, между прогонами не разделяется. */
export function createStepBus(): StepBus {
    const values = new Map<AiPipelineBusKey, unknown>();
    return {
        get: <T>(key: AiPipelineBusKey): T | undefined =>
            values.get(key) as T | undefined,
        set: <T>(key: AiPipelineBusKey, value: T): void => {
            values.set(key, value);
        },
    };
}

/**
 * Результат шага. `skipped` — штатная деградация (нет прав, коротка
 * история, нет данных): конвейер продолжается, журнал получает статус
 * «частично». `failed` — падение: журнал пишется, исключение
 * пробрасывается, слот портала освобождается.
 */
export interface AiPipelineStepResult {
    /** Код шага (уникален в массиве шагов). */
    step: string;
    status: AiAnalyticsEtlStepStatus;
    /** Длительность шага, мс. */
    ms: number;
    /** Загружено строк источника. */
    rows: number;
    /** Вызовов Bitrix REST на шаге. */
    bitrixCalls: number;
    /** Снапшотов записано шагом. */
    written: number;
    /** Причина пропуска или текст ошибки. */
    reason?: string;
    /** Потрачено на LLM, ₽ (шаги без LLM не заполняют). */
    llmPrice?: number;
}

/** Шаг конвейера: код, ритмы, в которых он участвует, и сам прогон. */
export interface AiAnalyticsPipelineStep {
    readonly code: string;
    readonly rhythms: readonly AiPipelineRhythm[];
    run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult>;
}

/** Успешный результат шага (сахар: поля по умолчанию — нули). */
export function stepOk(
    step: string,
    values: Partial<Omit<AiPipelineStepResult, 'step' | 'status'>> = {},
): AiPipelineStepResult {
    return {
        step,
        status: 'ok',
        ms: 0,
        rows: 0,
        bitrixCalls: 0,
        written: 0,
        ...values,
    };
}

/** Пропуск шага с обязательной причиной (штатная деградация §5.4). */
export function stepSkipped(
    step: string,
    reason: string,
    values: Partial<Omit<AiPipelineStepResult, 'step' | 'status'>> = {},
): AiPipelineStepResult {
    return { ...stepOk(step, values), status: 'skipped', reason };
}

/** Падение шага: причина едет в журнал и в текст исключения. */
export function stepFailed(
    step: string,
    reason: string,
    values: Partial<Omit<AiPipelineStepResult, 'step' | 'status'>> = {},
): AiPipelineStepResult {
    return { ...stepOk(step, values), status: 'failed', reason };
}

/**
 * Bull-джоба в объёме, нужном раннеру: данные и постановка перекладки при
 * занятом слоте. Узкий тип вместо Job<T> — чтобы раннер тестировался без
 * Redis и Bull (Job<AiSnapshotJobData> подходит структурно).
 */
export interface AiPipelineJobLike {
    data: AiSnapshotJobData;
    queue: {
        add(
            name: string,
            data: AiSnapshotJobData,
            opts: JobOptions,
        ): Promise<unknown>;
    };
}

/** Раннер конвейера глазами процессора (см. AI_ANALYTICS_SNAPSHOT_RUNNER). */
export interface AiSnapshotRunner {
    run(job: AiPipelineJobLike, now?: Date): Promise<AiPipelineRunSummary>;
}
