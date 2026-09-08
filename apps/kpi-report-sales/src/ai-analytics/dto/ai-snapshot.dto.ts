import type { EtlRunSnapshot, EtlStepResult } from '@lib/sales-ai-analytics';
import { AiAnalyticsSnapshotKind } from '../constants/ai-analytics.const';
import {
    AiPipelineJournalStatus,
    AiPipelineMetricName,
    AiPipelineRhythm,
    AiPipelineRunStatus,
} from '../constants/ai-snapshot.const';

/**
 * Payload Bull-джобы SALES_AI_ANALYTICS_SNAPSHOT (внутренний контракт
 * scheduler → processor, валидаторы не нужны; план §5.3). monthKey —
 * месяц запуска YYYY-MM в TZ портала: часть jobId (один снапшот вида на
 * портал в месяц). Ритмы конвейера Фазы 2 (nightly/weekly/monthly/backfill)
 * дополнительно везут день и неделю прогона: ключи считает планировщик,
 * чтобы вид, jobId и период не разъезжались между тиком и раннером.
 */
export interface AiSnapshotJobData {
    domain: string;
    kind: AiAnalyticsSnapshotKind;
    monthKey: string;
    /** День прогона 'YYYY-MM-DD' в TZ портала; нет — считает раннер. */
    day?: string;
    /** ISO-неделя прогона 'YYYY-Www'; нет — считает раннер. */
    weekKey?: string;
    /**
     * Белый список кодов шагов: пусто — все шаги ритма. Тик 1-го числа
     * ставит джобу ритма `monthly` только со снимком планов.
     */
    steps?: string[];
    /** Пересчитать, даже если данные уже в кэше и снапшоте. */
    forceRefresh?: boolean;
    /** План backfill (владелец — сервис backfill второй половины потока). */
    backfill?: AiSnapshotBackfillPlan;
    /** Сколько раз джобу уже перекладывали из-за занятого слота портала. */
    slotRetries?: number;
}

/** Что доливает backfill за ночь: месяцы и недели с лимитами плана. */
export interface AiSnapshotBackfillPlan {
    /** Месяцы 'YYYY-MM' — не больше AI_PIPELINE_BACKFILL.maxMonthsPerNight. */
    monthKeys: string[];
    /** Недели 'YYYY-Www' — не больше AI_PIPELINE_BACKFILL.weekLimit. */
    weekKeys: string[];
    /** Почему план пуст (вне ночного окна 22:00–06:00 и т. п.). */
    reason?: string;
}

/** Итог месячного снапшота аудита (для логов процессора и тестов). */
export interface AiAuditSnapshotResult {
    domain: string;
    monthKey: string;
    /** ISO (UTC). */
    generatedAt: string;
    /** Звонков в окне и с глубоким разбором — краткая сводка отчёта. */
    calls: number;
    analyzed: number;
}

/**
 * Шаг в журнале прогона: контракт библиотеки (EtlStepResult) плюс причина
 * пропуска и число записанных снапшотов. Причина обязательна у статуса
 * `skipped` — штатная деградация всегда объясняется (план §5.4).
 */
export interface AiEtlStepRecord extends EtlStepResult {
    /** Причина пропуска ('stage-history-too-short' и т. п.); иначе null. */
    reason: string | null;
    /** Снапшотов записано шагом. */
    written: number;
}

/**
 * Нагрузка снапшота `ai-analytics-etl-run` (план §3.1): шаги с
 * длительностями, строками и вызовами Битрикс, признак дрейфа входов,
 * предупреждения санити-панели и все четыре метрики прогона.
 */
export interface AiEtlRunPayload extends EtlRunSnapshot {
    /** Ритм прогона: ночной, недельный, месячный или добор истории. */
    rhythm: AiPipelineRhythm;
    /** ok — все шаги прошли, partial — были пропуски, failed — падение. */
    status: AiPipelineJournalStatus;
    steps: AiEtlStepRecord[];
    /** Суммарно загружено строк источников за прогон. */
    rowsLoaded: number;
    /** Предупреждения прогона (в том числе недельной санити-панели). */
    warnings: string[];
    /** Значения метрик AI_PIPELINE_METRICS за прогон. */
    metrics: Record<AiPipelineMetricName, number>;
}

/** Итог прогона конвейера (ответ процессора, логи и тесты). */
export interface AiPipelineRunSummary {
    domain: string;
    rhythm: AiPipelineRhythm;
    /** День прогона 'YYYY-MM-DD' в TZ портала. */
    day: string;
    status: AiPipelineRunStatus;
    /** Шаги прогона в порядке выполнения; пусто — слот был занят. */
    steps: AiEtlStepRecord[];
    /** id записи журнала в ais; null — журнал не писался (перекладка). */
    etlRunId: string | null;
    durationMs: number;
    /** Почему джоба переставлена (статус `requeued`). */
    reason?: string;
}
