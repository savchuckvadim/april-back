/**
 * Состояние ночного конвейера для админки (план Фазы 3, П5): последние
 * журналы прогонов (`ai-analytics-etl-run`) домена за окно дней — шаги,
 * пропуски, длительности, вызовы Битрикс и метрики прогона.
 *
 * Только чтение: считает и пишет журнал воркер `apps/kpi-report-sales`
 * (`pipeline/etl-run.writer.ts`), библиотека приложение импортировать не
 * может. Нагрузка журнала разбирается структурно (форма писателя —
 * `EtlRunSnapshot` плюс поля приложения), чужая форма запись пропускает.
 */
import { Injectable } from '@nestjs/common';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import {
    AiAnalyticsAdminSnapshotStore,
    AiAnalyticsAdminSnapshotRecord,
} from '../ai-analytics-admin-snapshot.store';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Шаг прогона в ответе ручки. */
export interface EtlStatusStep {
    step: string;
    /** ok | skipped | failed — статус шага в журнале. */
    status: string;
    durationMs: number;
    rowsLoaded: number;
    bitrixCalls: number;
    /** Записано снапшотов шагом. */
    written: number;
    /** Причина пропуска ('stage-history-too-short' и т. п.); иначе null. */
    reason: string | null;
    /** Текст ошибки при status = failed; иначе null. */
    error: string | null;
}

/** Один прогон конвейера. */
export interface EtlStatusRun {
    /** id записи ais журнала. */
    id: string;
    /** День прогона 'YYYY-MM-DD' в TZ портала. */
    day: string;
    /** Ритм: nightly | weekly | monthly | backfill; пусто — не указан. */
    rhythm: string;
    /** ok | partial | failed. */
    status: string;
    durationMs: number;
    rowsLoaded: number;
    bitrixCalls: number;
    /** Входы поехали относительно прошлого прогона. */
    inputsDrift: boolean;
    steps: EtlStatusStep[];
    /** Коды пропущенных шагов. */
    skipped: string[];
    /** Коды упавших шагов. */
    failed: string[];
    warnings: string[];
    /** Метрики прогона (`pipeline/ai-analytics.metrics.ts`). */
    metrics: Record<string, number>;
    /** Момент формирования журнала, ISO (UTC). */
    generatedAt: string;
    calcVersion: string;
    paramsVersion: string;
}

/** Сводка окна: сколько прогонов какого исхода и суммы объёмов. */
export interface EtlStatusSummary {
    runs: number;
    ok: number;
    partial: number;
    failed: number;
    rowsLoaded: number;
    bitrixCalls: number;
    /** Прогоны с признаком дрейфа входов. */
    drifted: number;
}

/** Ответ ручки `GET admin/ai-analytics/etl-status`. */
export interface EtlStatusResult {
    domain: string;
    days: number;
    /** Момент ответа, ISO (UTC). */
    checkedAt: string;
    summary: EtlStatusSummary;
    runs: EtlStatusRun[];
}

@Injectable()
export class AiAnalyticsEtlStatusService {
    constructor(private readonly store: AiAnalyticsAdminSnapshotStore) {}

    /** Журналы прогонов домена за последние `days` дней, свежие первыми. */
    async status(
        domain: string,
        days: number,
        now: Date = new Date(),
    ): Promise<EtlStatusResult> {
        const records = await this.store.read(
            domain,
            [AI_ANALYTICS_SNAPSHOT_TYPE.etlRun],
            {
                from: new Date(now.getTime() - days * DAY_MS),
                to: new Date(now.getTime() + DAY_MS),
            },
            now,
        );
        const runs = records.map(record => toRun(record));
        return {
            domain,
            days,
            checkedAt: now.toISOString(),
            summary: summarize(runs),
            runs,
        };
    }
}

function toRun(record: AiAnalyticsAdminSnapshotRecord): EtlStatusRun {
    const payload = asRecord(record.payload);
    const steps = asArray(payload.steps).map(step => toStep(step));
    return {
        id: record.id,
        day: asString(payload.day) ?? record.periodKey,
        rhythm: asString(payload.rhythm) ?? '',
        status: asString(payload.status) ?? '',
        durationMs: asNumber(payload.durationMs),
        rowsLoaded: asNumber(payload.rowsLoaded),
        bitrixCalls: asNumber(payload.bitrixCalls),
        inputsDrift: payload.inputsDrift === true,
        steps,
        skipped: steps
            .filter(step => step.status === 'skipped')
            .map(step => step.step),
        failed: steps
            .filter(step => step.status === 'failed')
            .map(step => step.step),
        warnings: asArray(payload.warnings).flatMap(warning => {
            const text = asString(warning);
            return text === null ? [] : [text];
        }),
        metrics: toMetrics(payload.metrics),
        generatedAt: record.generatedAt,
        calcVersion: record.calcVersion,
        paramsVersion: record.paramsVersion,
    };
}

function toStep(value: unknown): EtlStatusStep {
    const step = asRecord(value);
    return {
        step: asString(step.step) ?? '',
        status: asString(step.status) ?? '',
        durationMs: asNumber(step.durationMs),
        rowsLoaded: asNumber(step.rowsLoaded),
        bitrixCalls: asNumber(step.bitrixCalls),
        written: asNumber(step.written),
        reason: asString(step.reason),
        error: asString(step.error),
    };
}

function toMetrics(value: unknown): Record<string, number> {
    const source = asRecord(value);
    const metrics: Record<string, number> = {};
    for (const [key, raw] of Object.entries(source)) {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            metrics[key] = raw;
        }
    }
    return metrics;
}

function summarize(runs: readonly EtlStatusRun[]): EtlStatusSummary {
    const count = (status: string): number =>
        runs.filter(run => run.status === status).length;
    return {
        runs: runs.length,
        ok: count('ok'),
        partial: count('partial'),
        failed: count('failed'),
        rowsLoaded: runs.reduce((sum, run) => sum + run.rowsLoaded, 0),
        bitrixCalls: runs.reduce((sum, run) => sum + run.bitrixCalls, 0),
        drifted: runs.filter(run => run.inputsDrift).length,
    };
}

const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

const asArray = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

const asString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const asNumber = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
