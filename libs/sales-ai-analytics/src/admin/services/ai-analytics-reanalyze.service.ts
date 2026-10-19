/**
 * Переразбор истории текущей версией промпта из админки (этап 1B плана
 * 2026-10-19-ai-focus-plan): постановка джобы `CALL_REPORT_REANALYZE` в
 * очередь `CALL_REPORT` (воркер — `apps/event-sales`, там фокус-разбор,
 * транскрипции и паспорт звонка; dryRun тоже идёт через джобу — у админки
 * нет доступа к транскрипциям) и чтение статуса прогона с отчётом
 * согласия старой и новой версии.
 *
 * `QueueDispatcherService` приходит опционально: без очереди (спеки,
 * сборки без Redis) ручка честно отвечает «не подключено».
 */
import { Injectable, Optional } from '@nestjs/common';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    AI_ANALYTICS_VERSION_AGREEMENT_TYPE,
    CALL_REPORT_REANALYSIS_RUN_TYPE,
    isReanalysisRunStatusLike,
    REANALYSIS_DEFAULTS,
    REANALYSIS_JOB_OPTIONS,
    reanalysisRunKey,
    reanalyzeJobId,
    type ReanalysisJobData,
    type ReanalysisRunStatus,
} from '../../contracts/reanalysis.types';
import { AI_ANALYTICS_SNAPSHOT_STATUS } from '../../contracts/snapshot-kinds.const';
import { parseSnapshotUserResult } from '../../contracts/snapshot.parse';
import {
    isVersionAgreementReportLike,
    type VersionAgreementReport,
} from '../../model/agreement/version-agreement-report';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';

/** Вход запуска переразбора. */
export interface ReanalyzeRunInput {
    domain: string;
    from: string;
    to: string;
    userIds?: number[];
    quota?: number;
    dryRun?: boolean;
    timeZone?: string;
    requestedBy?: string;
}

/** Ответ ручки `POST admin/ai-analytics/reanalyze`. */
export interface ReanalyzeRunResult {
    domain: string;
    from: string;
    to: string;
    dryRun: boolean;
    dispatched: boolean;
    jobId: string | null;
    reason: string | null;
    quota: number;
}

/** Сдвиг шкалы раздела «новая − старая» в разрезе старой версии. */
export interface VersionAgreementShift {
    code: string;
    n: number;
    meanShift: number | null;
}

/** Разбивка отчёта согласия по старой версии промпта (плоский вид для DTO). */
export interface VersionAgreementBreakdownEntry {
    promptVersion: string;
    pairs: number;
    icc21: number | null;
    icc31: number | null;
    sigma: number | null;
    meanShift: number | null;
    sectionShifts: VersionAgreementShift[];
}

/** Отчёт согласия версий в составе статуса. */
export interface VersionAgreementEntry {
    id: string;
    key: string;
    fromSeries: string;
    toPromptVersion: string;
    pairs: number;
    /** σ_llm общего отчёта к применению и её источник. */
    sigmaLlm: number;
    sigmaSource: string;
    /** ICC(2,1) общего балла по всем парам; null — меньше двух пар. */
    icc21: number | null;
    byOldPromptVersion: VersionAgreementBreakdownEntry[];
    generatedAt: string;
}

/** Ответ ручки `GET admin/ai-analytics/reanalyze-status`. */
export interface ReanalyzeStatusResult {
    domain: string;
    from: string;
    to: string;
    /** Статус прогона периода; null — прогона не было. */
    run: ReanalysisRunStatus | null;
    runRecordId: string | null;
    /** Активные отчёты согласия версий портала, свежие первыми. */
    agreement: VersionAgreementEntry[];
    runAvailable: boolean;
    hint: string;
}

export const REANALYZE_MESSAGES = {
    runNotWired:
        'Переразбор не подключён в этой сборке: очередь CALL_REPORT ' +
        'недоступна, ставить джобу некуда.',
    emptyRange: 'reanalyze-empty-range',
    hint:
        'Порядок: dryRun → запуск → после finished: true — backfill с ' +
        'forceRefresh за период и cache/reset витрины, чтобы недели/месяцы ' +
        'пересобрались по новым разборам. Карточки в Битриксе не меняются.',
} as const;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class AiAnalyticsReanalyzeService {
    constructor(
        private readonly store: AiAnalyticsAdminSnapshotStore,
        @Optional() private readonly dispatcher?: QueueDispatcherService,
    ) {}

    /** Постановка джобы части 1; без очереди или при пустом периоде — отказ. */
    async run(input: ReanalyzeRunInput): Promise<ReanalyzeRunResult> {
        const quota = input.quota ?? REANALYSIS_DEFAULTS.quota;
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
                reason: REANALYZE_MESSAGES.emptyRange,
            };
        }
        if (this.dispatcher === undefined) {
            return {
                ...base,
                dispatched: false,
                jobId: null,
                reason: REANALYZE_MESSAGES.runNotWired,
            };
        }
        const payload: ReanalysisJobData = {
            domain: input.domain,
            from: input.from,
            to: input.to,
            quota,
            dryRun,
            part: 1,
            ...(input.userIds === undefined ? {} : { userIds: input.userIds }),
            ...(input.timeZone === undefined
                ? {}
                : { timeZone: input.timeZone }),
            ...(input.requestedBy === undefined
                ? {}
                : { requestedBy: input.requestedBy }),
        };
        const jobId = reanalyzeJobId(payload);
        const job = await this.dispatcher.dispatch<ReanalysisJobData>(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_REANALYZE,
            payload,
            jobId,
            REANALYSIS_JOB_OPTIONS,
        );
        return {
            ...base,
            dispatched: true,
            jobId: String(job.id ?? jobId),
            reason: null,
        };
    }

    /** Статус прогона периода и активные отчёты согласия версий портала. */
    async status(
        domain: string,
        from: string,
        to: string,
    ): Promise<ReanalyzeStatusResult> {
        const key = reanalysisRunKey(from, to);
        const runs = await this.store.readRaw(domain, [
            CALL_REPORT_REANALYSIS_RUN_TYPE,
        ]);
        const run = runs.find(
            record =>
                record.periodKey === key &&
                record.status !== AI_ANALYTICS_SNAPSHOT_STATUS.superseded &&
                isReanalysisRunStatusLike(record.userResult),
        );
        const reports = await this.store.readRaw(domain, [
            AI_ANALYTICS_VERSION_AGREEMENT_TYPE,
        ]);
        const agreement = reports.flatMap(record => {
            if (record.status === AI_ANALYTICS_SNAPSHOT_STATUS.superseded) {
                return [];
            }
            const envelope = parseSnapshotUserResult(record.userResult);
            if (!envelope || !isVersionAgreementReportLike(envelope.payload)) {
                return [];
            }
            return [toEntry(record.id, envelope.generatedAt, envelope.payload)];
        });
        return {
            domain,
            from,
            to,
            run: run ? (run.userResult as ReanalysisRunStatus) : null,
            runRecordId: run?.id ?? null,
            agreement,
            runAvailable: this.dispatcher !== undefined,
            hint: REANALYZE_MESSAGES.hint,
        };
    }
}

function toEntry(
    id: string,
    generatedAt: string,
    report: VersionAgreementReport,
): VersionAgreementEntry {
    const score = report.overall.scales.find(
        scale => scale.code === report.overall.sigmaLlm.scale,
    );
    return {
        id,
        key: report.key,
        fromSeries: report.fromSeries,
        toPromptVersion: report.toPromptVersion,
        pairs: report.pairs,
        sigmaLlm: report.overall.sigmaLlm.value,
        sigmaSource: report.overall.sigmaLlm.source,
        icc21: score?.icc?.icc21 ?? null,
        byOldPromptVersion: report.byOldPromptVersion.map(item => ({
            promptVersion: item.promptVersion,
            pairs: item.pairs,
            icc21: item.icc?.icc21 ?? null,
            icc31: item.icc?.icc31 ?? null,
            sigma: item.sigma,
            meanShift: item.meanShift,
            sectionShifts: item.sectionShifts.map(shift => ({
                code: shift.code,
                n: shift.n,
                meanShift: shift.meanShift,
            })),
        })),
        generatedAt,
    };
}
