/**
 * Ручной запуск конвейера снапшотов из админки (план Фазы 3, П5;
 * решение владельца В2 от 22.09.2026 — `QueueModule` подключён и в
 * `apps/admin`, очередь общая, воркер остаётся в kpi-report-sales).
 *
 * Здесь только постановка джоб: расчёт живёт в приложении
 * (`pipeline/snapshot-pipeline.service.ts`), библиотека приложение
 * импортировать не может. Контракт очереди — `ai-analytics-admin.const.ts`.
 *
 * Идемпотентность. У ритмов jobId детерминирован по периоду, и Bull молча
 * игнорирует повтор существующего id. Поэтому у `recompute` (сознательный
 * пересчёт) ключ несёт метку момента — иначе повторный запуск тихо
 * пропал бы; у `backfill` ключ обычный, повтор за тот же период дубля не
 * создаёт.
 */
import { Injectable, Logger } from '@nestjs/common';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    AI_ANALYTICS_ADMIN_JOB_OPTIONS,
    AiAnalyticsAdminRhythm,
    AiAnalyticsAdminSnapshotJob,
    adminPipelineKey,
    buildAdminPipelineJobId,
    recomputeJobKey,
} from '../ai-analytics-admin.const';

/** Что пересчитать: период одного ритма. */
export interface RecomputeInput {
    domain: string;
    rhythm: AiAnalyticsAdminRhythm;
    /** Месяц 'YYYY-MM' в TZ портала. */
    monthKey: string;
    /** День прогона 'YYYY-MM-DD'; нет — считает раннер. */
    day?: string;
    /** ISO-неделя 'YYYY-Www'; нет — считает раннер. */
    weekKey?: string;
    /** Белый список кодов шагов; пусто — все шаги ритма. */
    steps?: string[];
}

/** Что догнать: диапазон месяцев одним ритмом backfill. */
export interface BackfillInput {
    domain: string;
    /** Первый месяц диапазона 'YYYY-MM' включительно. */
    from: string;
    /** Последний месяц диапазона 'YYYY-MM' включительно. */
    to: string;
    steps?: string[];
}

/** Поставленная джоба: id и её ключ периода. */
export interface DispatchedJob {
    jobId: string;
    /** Ключ периода джобы ('2026-09', '2026-W36', '2026-09-21'). */
    key: string;
    rhythm: AiAnalyticsAdminRhythm;
}

/** Ответ `POST recompute`: одна джоба. */
export interface RecomputeResult {
    domain: string;
    job: DispatchedJob;
    /** Пересчёт принудительный: forceRefresh = true. */
    forceRefresh: true;
}

/** Ответ `POST backfill`: оценка объёма и поставленные джобы. */
export interface BackfillResult {
    domain: string;
    /** Месяцы диапазона, по одному на джобу. */
    monthKeys: string[];
    /** Сколько джоб поставлено (= числу месяцев). */
    jobs: DispatchedJob[];
    /** Отказ: диапазон пуст или перевёрнут; иначе null. */
    reason: string | null;
}

/** Верхняя граница месяцев за один запрос backfill — чтобы не залить очередь. */
export const AI_ANALYTICS_ADMIN_BACKFILL_MAX_MONTHS = 24;

/** Почему backfill ничего не поставил. */
export const AI_ANALYTICS_ADMIN_BACKFILL_REASONS = {
    emptyRange: 'backfill-empty-range',
    tooWide: 'backfill-range-too-wide',
} as const;

@Injectable()
export class AiAnalyticsPipelineAdminService {
    private readonly logger = new Logger(AiAnalyticsPipelineAdminService.name);

    constructor(private readonly dispatcher: QueueDispatcherService) {}

    /** Принудительный пересчёт периода: одна джоба с forceRefresh. */
    async recompute(
        input: RecomputeInput,
        now: Date = new Date(),
    ): Promise<RecomputeResult> {
        const job: AiAnalyticsAdminSnapshotJob = {
            domain: input.domain,
            kind: input.rhythm,
            monthKey: input.monthKey,
            ...(input.day ? { day: input.day } : {}),
            ...(input.weekKey ? { weekKey: input.weekKey } : {}),
            ...(input.steps?.length ? { steps: [...input.steps] } : {}),
            forceRefresh: true,
        };
        const key = recomputeJobKey(
            adminPipelineKey(job),
            String(now.getTime()),
        );
        const dispatched = await this.enqueue(job, key);
        this.logger.log(
            `Ручной пересчёт ${input.domain} (${input.rhythm}) → ${dispatched.jobId}`,
        );
        return { domain: input.domain, job: dispatched, forceRefresh: true };
    }

    /** Догон диапазона месяцев: по джобе ритма backfill на месяц. */
    async backfill(input: BackfillInput): Promise<BackfillResult> {
        const monthKeys = monthRange(input.from, input.to);
        if (monthKeys.length === 0) {
            return {
                domain: input.domain,
                monthKeys: [],
                jobs: [],
                reason: AI_ANALYTICS_ADMIN_BACKFILL_REASONS.emptyRange,
            };
        }
        if (monthKeys.length > AI_ANALYTICS_ADMIN_BACKFILL_MAX_MONTHS) {
            return {
                domain: input.domain,
                monthKeys,
                jobs: [],
                reason: AI_ANALYTICS_ADMIN_BACKFILL_REASONS.tooWide,
            };
        }
        const jobs: DispatchedJob[] = [];
        for (const monthKey of monthKeys) {
            const job: AiAnalyticsAdminSnapshotJob = {
                domain: input.domain,
                kind: 'backfill',
                monthKey,
                day: monthLastDay(monthKey),
                ...(input.steps?.length ? { steps: [...input.steps] } : {}),
            };
            jobs.push(await this.enqueue(job, monthKey));
        }
        this.logger.log(
            `Ручной догон ${input.domain}: месяцев ${monthKeys.length}`,
        );
        return { domain: input.domain, monthKeys, jobs, reason: null };
    }

    private async enqueue(
        job: AiAnalyticsAdminSnapshotJob,
        key: string,
    ): Promise<DispatchedJob> {
        const jobId = buildAdminPipelineJobId(job.kind, job.domain, key);
        await this.dispatcher.dispatch<AiAnalyticsAdminSnapshotJob>(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_SNAPSHOT,
            job,
            jobId,
            AI_ANALYTICS_ADMIN_JOB_OPTIONS,
        );
        return { jobId, key, rhythm: job.kind };
    }
}

/** Месяцы 'YYYY-MM' от `from` до `to` включительно; перевёрнутый — пусто. */
export function monthRange(from: string, to: string): string[] {
    if (!isMonthKey(from) || !isMonthKey(to) || from > to) return [];
    const months: string[] = [];
    let cursor = from;
    while (cursor <= to) {
        months.push(cursor);
        cursor = nextMonthKey(cursor);
    }
    return months;
}

/** Последний день месяца 'YYYY-MM' — день прогона джобы месяца. */
export function monthLastDay(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${monthKey}-${String(days).padStart(2, '0')}`;
}

function nextMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    return month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, '0')}`;
}

function isMonthKey(value: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
