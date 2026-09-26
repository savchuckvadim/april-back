/**
 * Золотой набор test-retest (план Фазы 3, П5 ↔ П7): состав отчётов
 * согласия оценщика по порталу и запуск повторного прогона.
 *
 * Состав — чтение снапшотов `ai-analytics-golden-report` (контракт
 * `contracts/golden-report.types.ts`, хранятся бессрочно): по одной
 * записи на версию промпта, свежие первыми.
 *
 * Запуск — джоба `CALL_REPORT_RETEST` в очереди `CALL_REPORT` (её воркер
 * живёт в `apps/event-sales`: там фокус-разбор и паспорт звонка).
 * `QueueDispatcherService` приходит опционально: без очереди (спеки,
 * сборки без Redis) ручка честно отвечает «прогон не подключён», а не
 * молчаливым успехом.
 */
import { Injectable, Optional } from '@nestjs/common';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import {
    GoldenReport,
    isGoldenReportLike,
} from '../../contracts/golden-report.types';
import { AGREEMENT_DEFAULTS } from '../../model/agreement/agreement.types';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';

/** Отчёт согласия в составе набора (шапка без разрезов). */
export interface GoldenSetEntry {
    /** id записи ais отчёта. */
    id: string;
    /** Ключ записи — хэш версии промпта. */
    periodKey: string;
    promptVersion: string;
    /** Пар разборов в отчёте. */
    pairs: number;
    /** Квота `retest_budget_calls` и уложилась ли выборка. */
    quota: number;
    withinQuota: boolean;
    /** σ_llm к применению и её источник (measured | configured). */
    sigmaLlm: number;
    sigmaSource: string;
    /** Момент формирования отчёта, ISO (UTC). */
    generatedAt: string;
}

/** Ответ ручки `GET admin/ai-analytics/golden-set`. */
export interface GoldenSetResult {
    domain: string;
    /** Отчётов согласия по порталу. */
    total: number;
    /** Записей чужой формы (в состав не вошли). */
    skipped: number;
    entries: GoldenSetEntry[];
    /** Подключён ли запуск прогона (очередь доступна). */
    runAvailable: boolean;
    /** Как читать состав и что даёт запуск. */
    hint: string;
}

/** Вход запуска прогона. */
export interface GoldenSetRunInput {
    domain: string;
    /** Квота пар; нет — `retest_budget_calls` реестра. */
    quota?: number;
    /** Кто запустил (для логов воркера). */
    requestedBy?: string;
}

/** Ответ ручки `POST admin/ai-analytics/golden-set/run`. */
export interface GoldenSetRunResult {
    domain: string;
    /** Джоба поставлена. */
    dispatched: boolean;
    /** jobId поставленной джобы; null — не поставлена. */
    jobId: string | null;
    /** Почему прогон не запущен; null — запущен. */
    reason: string | null;
    /** Квота пар, с которой уйдёт прогон. */
    quota: number;
}

/** Payload джобы повторного прогона (контракт с воркером event-sales). */
export interface GoldenSetRetestJob {
    domain: string;
    quota: number;
    requestedBy?: string;
}

/** Тексты состояния запуска (единые для ручек и спек). */
export const GOLDEN_SET_MESSAGES = {
    runNotWired:
        'Прогон test-retest не подключён в этой сборке: очередь CALL_REPORT ' +
        'недоступна, ставить джобу некуда.',
    hint:
        'Ручка отдаёт состав посчитанных отчётов согласия ' +
        '(ai-analytics-golden-report). Запуск golden-set/run ставит джобу ' +
        'повторного прогона в очередь CALL_REPORT: выборка разборов текущей ' +
        'версии промпта повторяется тем же разбором, отчёт появляется здесь.',
} as const;

/** Таймаут джобы — больше бюджета времени прогона (45 мин). */
export const GOLDEN_SET_JOB_TIMEOUT_MS = 60 * 60 * 1000;

/** jobId прогона: один запуск на домен в сутки (повтор Bull молча игнорирует). */
export function goldenSetJobId(domain: string, now: Date): string {
    return `${JobNames.CALL_REPORT_RETEST}:${domain}:${now.toISOString().slice(0, 10)}`;
}

@Injectable()
export class AiAnalyticsGoldenSetService {
    constructor(
        private readonly store: AiAnalyticsAdminSnapshotStore,
        @Optional() private readonly dispatcher?: QueueDispatcherService,
    ) {}

    /** Отчёты согласия портала, свежие первыми. */
    async list(domain: string): Promise<GoldenSetResult> {
        const records = await this.store.read<GoldenReport>(domain, [
            AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport,
        ]);
        const entries = records.flatMap(record =>
            isGoldenReportLike(record.payload)
                ? [
                      {
                          id: record.id,
                          periodKey: record.periodKey,
                          promptVersion: record.payload.promptVersion,
                          pairs: record.payload.pairs,
                          quota: record.payload.budget.quota,
                          withinQuota: record.payload.budget.withinQuota,
                          sigmaLlm: record.payload.sigmaLlm.value,
                          sigmaSource: record.payload.sigmaLlm.source,
                          generatedAt: record.generatedAt,
                      },
                  ]
                : [],
        );
        return {
            domain,
            total: entries.length,
            skipped: records.length - entries.length,
            entries,
            runAvailable: this.dispatcher !== undefined,
            hint: GOLDEN_SET_MESSAGES.hint,
        };
    }

    /** Постановка джобы повторного прогона; без очереди — отказ с причиной. */
    async run(
        input: GoldenSetRunInput,
        now: Date = new Date(),
    ): Promise<GoldenSetRunResult> {
        const quota = input.quota ?? AGREEMENT_DEFAULTS.retestBudgetCalls;
        if (this.dispatcher === undefined) {
            return {
                domain: input.domain,
                dispatched: false,
                jobId: null,
                reason: GOLDEN_SET_MESSAGES.runNotWired,
                quota,
            };
        }
        const jobId = goldenSetJobId(input.domain, now);
        const job = await this.dispatcher.dispatch<GoldenSetRetestJob>(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_RETEST,
            {
                domain: input.domain,
                quota,
                ...(input.requestedBy === undefined
                    ? {}
                    : { requestedBy: input.requestedBy }),
            },
            jobId,
            {
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: true,
                timeout: GOLDEN_SET_JOB_TIMEOUT_MS,
            },
        );

        return {
            domain: input.domain,
            dispatched: true,
            jobId: String(job.id ?? jobId),
            reason: null,
            quota,
        };
    }
}
