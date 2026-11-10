/**
 * Догон фактов v3.1 в старых разборах из админки (этап B4): постановка
 * джобы `CALL_REPORT_FACTS_CATCHUP` в очередь `CALL_REPORT` (воркер —
 * `apps/event-sales`, там расшифровки, паспорт звонка и модель; dryRun
 * тоже идёт через джобу) и чтение статуса прогона.
 *
 * `QueueDispatcherService` приходит опционально: без очереди (спеки,
 * сборки без Redis) ручка честно отвечает «не подключено».
 */
import { Injectable, Optional } from '@nestjs/common';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    CALL_REPORT_FACTS_CATCHUP_RUN_TYPE,
    FACTS_CATCHUP_DEFAULTS,
    FACTS_CATCHUP_JOB_OPTIONS,
    factsCatchupJobId,
    factsCatchupRunKey,
    isFactsCatchupRunStatusLike,
    type FactsCatchupJobData,
    type FactsCatchupRunStatus,
} from '../../contracts/facts-catchup.types';
import { AI_ANALYTICS_SNAPSHOT_STATUS } from '../../contracts/snapshot-kinds.const';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';

/** Вход запуска догона. */
export interface FactsCatchupRunInput {
    domain: string;
    from: string;
    to: string;
    quota?: number;
    dryRun?: boolean;
    timeZone?: string;
    requestedBy?: string;
}

/** Ответ ручки `POST admin/ai-analytics/facts-catchup`. */
export interface FactsCatchupRunResult {
    domain: string;
    from: string;
    to: string;
    dryRun: boolean;
    dispatched: boolean;
    jobId: string | null;
    reason: string | null;
    quota: number;
}

/** Ответ ручки `GET admin/ai-analytics/facts-catchup-status`. */
export interface FactsCatchupStatusResult {
    domain: string;
    from: string;
    to: string;
    /** Статус прогона периода; null — прогона не было. */
    run: FactsCatchupRunStatus | null;
    runRecordId: string | null;
    runAvailable: boolean;
    hint: string;
}

export const FACTS_CATCHUP_MESSAGES = {
    runNotWired:
        'Догон фактов не подключён в этой сборке: очередь CALL_REPORT ' +
        'недоступна, ставить джобу некуда.',
    emptyRange: 'facts-catchup-empty-range',
    hint:
        'Порядок: подсчёт (dryRun) → запуск → после finished: true — ' +
        'отчёт собственнику за период пересобрать с forceRefresh, чтобы ' +
        'факты попали в числа. Оценки разборов и карточки в Битриксе не ' +
        'меняются.',
} as const;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class AiAnalyticsFactsCatchupService {
    constructor(
        private readonly store: AiAnalyticsAdminSnapshotStore,
        @Optional() private readonly dispatcher?: QueueDispatcherService,
    ) {}

    /** Постановка джобы части 1; без очереди или при пустом периоде — отказ. */
    async run(input: FactsCatchupRunInput): Promise<FactsCatchupRunResult> {
        const quota = input.quota ?? FACTS_CATCHUP_DEFAULTS.quota;
        const dryRun = input.dryRun === true;
        const base = {
            domain: input.domain,
            from: input.from,
            to: input.to,
            dryRun,
            quota,
        };
        if (
            !DATE_KEY.test(input.from) ||
            !DATE_KEY.test(input.to) ||
            input.from > input.to
        ) {
            return {
                ...base,
                dispatched: false,
                jobId: null,
                reason: FACTS_CATCHUP_MESSAGES.emptyRange,
            };
        }
        if (this.dispatcher === undefined) {
            return {
                ...base,
                dispatched: false,
                jobId: null,
                reason: FACTS_CATCHUP_MESSAGES.runNotWired,
            };
        }
        const payload: FactsCatchupJobData = {
            domain: input.domain,
            from: input.from,
            to: input.to,
            quota,
            dryRun,
            part: 1,
            ...(input.timeZone === undefined
                ? {}
                : { timeZone: input.timeZone }),
            ...(input.requestedBy === undefined
                ? {}
                : { requestedBy: input.requestedBy }),
        };
        const jobId = factsCatchupJobId(payload);
        const job = await this.dispatcher.dispatch<FactsCatchupJobData>(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_FACTS_CATCHUP,
            payload,
            jobId,
            FACTS_CATCHUP_JOB_OPTIONS,
        );
        return {
            ...base,
            dispatched: true,
            jobId: String(job.id ?? jobId),
            reason: null,
        };
    }

    /** Статус прогона периода. */
    async status(
        domain: string,
        from: string,
        to: string,
    ): Promise<FactsCatchupStatusResult> {
        const key = factsCatchupRunKey(from, to);
        const runs = await this.store.readRaw(domain, [
            CALL_REPORT_FACTS_CATCHUP_RUN_TYPE,
        ]);
        const run = runs.find(
            record =>
                record.periodKey === key &&
                record.status !== AI_ANALYTICS_SNAPSHOT_STATUS.superseded &&
                isFactsCatchupRunStatusLike(record.userResult),
        );
        return {
            domain,
            from,
            to,
            run: run ? (run.userResult as FactsCatchupRunStatus) : null,
            runRecordId: run?.id ?? null,
            runAvailable: this.dispatcher !== undefined,
            hint: FACTS_CATCHUP_MESSAGES.hint,
        };
    }

    /** Последний прогон догона домена по любому периоду; null — не было. */
    async latest(domain: string): Promise<FactsCatchupRunStatus | null> {
        const records = await this.store.readRaw(domain, [
            CALL_REPORT_FACTS_CATCHUP_RUN_TYPE,
        ]);
        let latest: FactsCatchupRunStatus | null = null;
        for (const record of records) {
            if (record.status === AI_ANALYTICS_SNAPSHOT_STATUS.superseded) {
                continue;
            }
            const value = record.userResult;
            if (!isFactsCatchupRunStatusLike(value)) continue;
            if (latest === null || value.updatedAt > latest.updatedAt) {
                latest = value;
            }
        }
        return latest;
    }
}
