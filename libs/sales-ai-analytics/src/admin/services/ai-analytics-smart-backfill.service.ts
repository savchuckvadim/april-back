/**
 * Дописывание полей карточек разборов из админки: постановка джобы
 * `CALL_REPORT_SMART_BACKFILL` в очередь `CALL_REPORT` (воркер —
 * `apps/event-sales`, там писатель смарта и сборка полей) и статус прогона
 * с числом карточек, ждущих записи полей.
 *
 * `QueueDispatcherService` приходит опционально: без очереди (спеки,
 * сборки без Redis) ручка честно отвечает «не подключено».
 */
import { Injectable, Optional } from '@nestjs/common';
import { AGENT_ANALYSIS_TYPE, AiService } from '@lib/call-lib';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    CALL_REPORT_SMART_BACKFILL_RUN_TYPE,
    isSmartBackfillRunStatusLike,
    SMART_BACKFILL_DEFAULTS,
    SMART_BACKFILL_JOB_OPTIONS,
    smartBackfillJobId,
    smartBackfillLookbackWindow,
    smartBackfillRunKey,
    type SmartBackfillJobData,
    type SmartBackfillMode,
    type SmartBackfillRunStatus,
} from '../../contracts/smart-backfill.types';
import { AI_ANALYTICS_SNAPSHOT_STATUS } from '../../contracts/snapshot-kinds.const';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';

/** Вход запуска: период не задан — последние N дней по сегодня. */
export interface SmartBackfillRunInput {
    domain: string;
    mode?: SmartBackfillMode;
    from?: string;
    to?: string;
    quota?: number;
    dryRun?: boolean;
    requestedBy?: string;
}

/** Ответ ручки `POST admin/ai-analytics/smart-backfill`. */
export interface SmartBackfillRunResult {
    domain: string;
    mode: SmartBackfillMode;
    from: string;
    to: string;
    dryRun: boolean;
    dispatched: boolean;
    jobId: string | null;
    reason: string | null;
    quota: number;
}

/** Ответ ручки `GET admin/ai-analytics/smart-backfill-status`. */
export interface SmartBackfillStatusResult {
    domain: string;
    /** Прогон запрошенного ключа (режим и период); null — не было. */
    run: SmartBackfillRunStatus | null;
    /** Самый свежий прогон домена по любому ключу; null — прогонов не было. */
    latest: SmartBackfillRunStatus | null;
    /** Карточек, ждущих записи полей, за окно pendingLookbackDays. */
    pending: number;
    pendingLookbackDays: number;
    runAvailable: boolean;
    hint: string;
}

export const SMART_BACKFILL_MESSAGES = {
    runNotWired:
        'Дописывание полей не подключено в этой сборке: очередь CALL_REPORT ' +
        'недоступна, ставить джобу некуда.',
    emptyRange: 'smart-backfill-empty-range',
    hint:
        'Режим «за период» переписывает поля всех карточек периода из ' +
        'сохранённых разборов (модель не вызывается), «только неудавшиеся» — ' +
        'карточки, у которых запись полей упала; их же каждую ночь подбирает ' +
        'крон. Сначала dryRun — покажет число карточек.',
} as const;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Сутки с каждой стороны: записи считаются по дате в поясе портала. */
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AiAnalyticsSmartBackfillService {
    constructor(
        private readonly store: AiAnalyticsAdminSnapshotStore,
        private readonly aiService: AiService,
        @Optional() private readonly dispatcher?: QueueDispatcherService,
    ) {}

    /** Постановка джобы части 1; без очереди или при пустом периоде — отказ. */
    async run(
        input: SmartBackfillRunInput,
        now: Date = new Date(),
    ): Promise<SmartBackfillRunResult> {
        const mode: SmartBackfillMode = input.mode ?? 'period';
        const quota = input.quota ?? SMART_BACKFILL_DEFAULTS.quota;
        const dryRun = input.dryRun === true;
        const window = this.windowOf(input, mode, now);
        const base = { domain: input.domain, mode, ...window, dryRun, quota };
        if (
            !DATE_KEY.test(window.from) ||
            !DATE_KEY.test(window.to) ||
            window.from > window.to
        ) {
            return {
                ...base,
                dispatched: false,
                jobId: null,
                reason: SMART_BACKFILL_MESSAGES.emptyRange,
            };
        }
        if (this.dispatcher === undefined) {
            return {
                ...base,
                dispatched: false,
                jobId: null,
                reason: SMART_BACKFILL_MESSAGES.runNotWired,
            };
        }
        const payload: SmartBackfillJobData = {
            domain: input.domain,
            mode,
            from: window.from,
            to: window.to,
            quota,
            dryRun,
            part: 1,
            source: 'admin',
            ...(input.requestedBy === undefined
                ? {}
                : { requestedBy: input.requestedBy }),
        };
        const jobId = smartBackfillJobId(payload);
        const job = await this.dispatcher.dispatch<SmartBackfillJobData>(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_SMART_BACKFILL,
            payload,
            jobId,
            SMART_BACKFILL_JOB_OPTIONS,
        );
        return {
            ...base,
            dispatched: true,
            jobId: String(job.id ?? jobId),
            reason: null,
        };
    }

    /** Статус прогона ключа, последний прогон домена и число ожидающих карточек. */
    async status(
        domain: string,
        key?: { mode: SmartBackfillMode; from: string; to: string },
        now: Date = new Date(),
    ): Promise<SmartBackfillStatusResult> {
        const records = await this.store.readRaw(domain, [
            CALL_REPORT_SMART_BACKFILL_RUN_TYPE,
        ]);
        const runs = records.flatMap(record =>
            record.status !== AI_ANALYTICS_SNAPSHOT_STATUS.superseded &&
            isSmartBackfillRunStatusLike(record.userResult)
                ? [{ key: record.periodKey, status: record.userResult }]
                : [],
        );
        const wanted = key
            ? smartBackfillRunKey(key.mode, key.from, key.to)
            : null;
        const run = wanted
            ? (runs.find(item => item.key === wanted)?.status ?? null)
            : null;
        let latest: SmartBackfillRunStatus | null = null;
        for (const item of runs) {
            if (latest === null || item.status.updatedAt > latest.updatedAt) {
                latest = item.status;
            }
        }
        return {
            domain,
            run,
            latest,
            pending: await this.pendingCount(domain, now),
            pendingLookbackDays: SMART_BACKFILL_DEFAULTS.pendingLookbackDays,
            runAvailable: this.dispatcher !== undefined,
            hint: SMART_BACKFILL_MESSAGES.hint,
        };
    }

    /** Период из входа; не задан — последние N дней режима по сегодня. */
    private windowOf(
        input: SmartBackfillRunInput,
        mode: SmartBackfillMode,
        now: Date,
    ): { from: string; to: string } {
        if (input.from !== undefined && input.to !== undefined) {
            return { from: input.from, to: input.to };
        }
        const days =
            mode === 'pending'
                ? SMART_BACKFILL_DEFAULTS.pendingLookbackDays
                : SMART_BACKFILL_DEFAULTS.periodLookbackDays;
        const fallback = smartBackfillLookbackWindow(
            now,
            days,
            SMART_BACKFILL_DEFAULTS.timeZone,
        );
        return {
            from: input.from ?? fallback.from,
            to: input.to ?? fallback.to,
        };
    }

    /** Карточки с элементом и неудавшейся записью полей за окно крона. */
    private async pendingCount(domain: string, now: Date): Promise<number> {
        const days = SMART_BACKFILL_DEFAULTS.pendingLookbackDays;
        const rows = await this.aiService.findSmartWriteCandidates(
            domain,
            AGENT_ANALYSIS_TYPE,
            new Date(now.getTime() - (days + 1) * DAY_MS),
            new Date(now.getTime() + DAY_MS),
            { pendingOnly: true },
        );
        return rows.length;
    }
}
