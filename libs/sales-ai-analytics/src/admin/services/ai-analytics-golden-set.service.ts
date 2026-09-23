/**
 * Золотой набор test-retest (план Фазы 3, П5 ↔ П7): состав отчётов
 * согласия оценщика по порталу и запуск повторного прогона.
 *
 * Состав — чтение снапшотов `ai-analytics-golden-report` (контракт
 * `contracts/golden-report.types.ts`, хранятся бессрочно): по одной
 * записи на версию промпта, свежие первыми.
 *
 * Запуск ПОКА не подключён: отбора выборки и повторного прогона в
 * очереди нет — они живут в контуре разбора `apps/event-sales`
 * (use-case `call-report-retest`), и своего значения `JobNames` у них
 * ещё не заведено (в `libs/queue/src/constants/job-names.enum.ts`
 * значений с retest/golden нет). Поэтому `run` возвращает отказ с
 * текстом «прогон подключается потоком П7», а не молчаливый успех.
 */
import { Injectable } from '@nestjs/common';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import {
    GoldenReport,
    isGoldenReportLike,
} from '../../contracts/golden-report.types';
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
    /** Подключён ли запуск прогона (см. шапку сервиса). */
    runAvailable: boolean;
    /** Что делать, если запуск ещё не подключён. */
    hint: string;
}

/** Ответ ручки `POST admin/ai-analytics/golden-set/run`. */
export interface GoldenSetRunResult {
    domain: string;
    /** Джоба поставлена; сейчас всегда false. */
    dispatched: false;
    /** jobId поставленной джобы; сейчас всегда null. */
    jobId: null;
    /** Почему прогон не запущен. */
    reason: string;
}

/** Тексты состояния «прогон ещё не подключён» (единые для ручек и спек). */
export const GOLDEN_SET_MESSAGES = {
    runNotWired:
        'Прогон test-retest подключается потоком П7: отбор выборки и ' +
        'повторный разбор живут в apps/event-sales, отдельного значения ' +
        'JobNames у них ещё нет — ставить в очередь нечего.',
    hint:
        'Ручка отдаёт состав уже посчитанных отчётов согласия ' +
        '(ai-analytics-golden-report). Запуск появится вместе с джобой ' +
        'повторного прогона (поток П7).',
} as const;

@Injectable()
export class AiAnalyticsGoldenSetService {
    constructor(private readonly store: AiAnalyticsAdminSnapshotStore) {}

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
            runAvailable: false,
            hint: GOLDEN_SET_MESSAGES.hint,
        };
    }

    /** Запуск прогона: пока отказ с объяснением (см. шапку сервиса). */
    run(domain: string): GoldenSetRunResult {
        return {
            domain,
            dispatched: false,
            jobId: null,
            reason: GOLDEN_SET_MESSAGES.runNotWired,
        };
    }
}
