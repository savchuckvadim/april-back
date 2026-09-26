/**
 * Test-retest языковой модели (план Фазы 3 AI-аналитики, поток П7
 * `p3-llm-agreement`): выборка разборов текущей версии промпта
 * повторно прогоняется тем же фокус-разбором, пары «первый − второй
 * прогон» сводятся в отчёт согласия (`buildGoldenReport` библиотеки) и
 * записываются снапшотом `ai-analytics-golden-report` в `ais` — по одной
 * актуальной записи на версию промпта (прежняя помечается superseded).
 *
 * Правила:
 * - в Битрикс и смарт-процесс ничего не пишется: повтор хранится только
 *   в `ais` записью `agent-analysis-retest`, чтобы второй запуск для той
 *   же версии не платил за уже повторённые звонки;
 * - квота `retest_budget_calls` (по умолчанию — реестр) ограничивает
 *   выборку; бюджет времени джобы — `RETEST_DEFAULTS.timeBudgetMs`: что
 *   не успели, в отчёт не входит (withinQuota честно показывает объём);
 * - вход повтора тот же, что у штатного разбора: расшифровка с
 *   таймкодами (П6) и паспорт звонка.
 *
 * `@Injectable` без bitrix-состояния: Битрикс здесь не нужен вовсе.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import {
    AGENT_ANALYSIS_RETEST_TYPE,
    AGENT_ANALYSIS_TYPE,
    AiService,
    CallTypeRegistryService,
    renderTranscriptWithTimecodes,
    TranscriptionStoreService,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import {
    AGREEMENT_DEFAULTS,
    AI_ANALYTICS_GOLDEN_REPORT_TYPE,
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    buildGoldenReport,
    type AgreementPair,
    type AnalysisVersions,
    type GoldenReport,
} from '@lib/sales-ai-analytics';
import {
    buildAnalysisVersions,
    buildRegistryHash,
    CALL_REPORT_REGISTRY_BUILTIN,
} from '../contracts/call-report-versions.const';
import { CallContextBuilderService } from '../services/call-context-builder.service';
import { CallFocusAnalysisService } from '../services/call-focus-analysis.service';
import { CallReportSettingsService } from '../services/call-report-settings.service';
import {
    latestPerTranscription,
    pairsHashOf,
    promptKeyOf,
    promptVersionOf,
    RETEST_SIGMA_SCALE,
    toAgreementPair,
} from './call-report-retest.util';

/** Payload джобы CALL_REPORT_RETEST (ставит админ-ручка golden-set/run). */
export interface CallReportRetestJobData {
    domain: string;
    /** Квота пар; нет — `retest_budget_calls` реестра. */
    quota?: number;
    /** Кто запустил (для логов). */
    requestedBy?: string;
}

/** Итог прогона — в лог и в результат джобы. */
export interface CallReportRetestResult {
    domain: string;
    promptVersion: string;
    /** Разборов текущей версии за окно отбора. */
    candidates: number;
    /** Взято в выборку (не больше квоты). */
    sampled: number;
    /** Повторено моделью в этом запуске. */
    rerun: number;
    /** Повторы взяты из прошлых запусков той же версии. */
    reused: number;
    /** Пар в отчёте. */
    pairs: number;
    /** id записи отчёта; null — пар не набралось, отчёт не писался. */
    reportId: string | null;
    sigmaLlm: { value: number; source: string } | null;
    /** Бюджет времени исчерпан до конца выборки. */
    timeBudgetHit: boolean;
    elapsedMs: number;
}

export const RETEST_DEFAULTS = {
    /** Окно отбора разборов, дней назад от запуска. */
    lookbackDays: 90,
    /** Бюджет времени одного запуска — 45 минут (таймаут джобы больше). */
    timeBudgetMs: 45 * 60 * 1000,
    /** Провайдер и версия расчёта в записях ais. */
    provider: 'call-report-retest',
    calcVersion: 'retest-1.0.0',
    app: 'call-report',
} as const;

/** Запись ais в объёме, нужном прогону. */
interface RetestRecord {
    id: string;
    transcription_id: string | null;
    user_result: unknown;
}

@Injectable()
export class CallReportRetestUseCase {
    private readonly logger = new Logger(CallReportRetestUseCase.name);

    constructor(
        private readonly aiService: AiService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly focusAnalysis: CallFocusAnalysisService,
        private readonly contextBuilder: CallContextBuilderService,
        private readonly settingsService: CallReportSettingsService,
        private readonly callTypeRegistry: CallTypeRegistryService,
    ) {}

    async execute(
        data: CallReportRetestJobData,
        now: Date = new Date(),
    ): Promise<CallReportRetestResult> {
        const startedAt = Date.now();
        const versions = buildAnalysisVersions(
            await this.registryHash(data.domain),
        );
        const quota = data.quota ?? AGREEMENT_DEFAULTS.retestBudgetCalls;
        const candidates = await this.candidates(data.domain, versions, now);
        const sample = candidates.slice(0, quota);
        const reused = await this.existingReruns(sample, versions.prompt);
        const settings = await this.settingsService.resolve(data.domain);
        const pairs: AgreementPair[] = [];
        let rerun = 0;
        let timeBudgetHit = false;
        for (const original of sample) {
            const transcriptionId = original.transcription_id as string;
            let second: unknown = reused.get(transcriptionId) ?? null;
            if (second === null) {
                if (Date.now() - startedAt > RETEST_DEFAULTS.timeBudgetMs) {
                    timeBudgetHit = true;
                    break;
                }
                second = await this.rerun(
                    original,
                    versions,
                    settings.deepAnalysisModel,
                );
                if (second === null) continue;
                rerun += 1;
            }
            const pair = toAgreementPair(
                transcriptionId,
                original.user_result,
                second,
            );
            if (pair !== null) pairs.push(pair);
        }
        const report =
            pairs.length === 0
                ? null
                : buildGoldenReport({
                      promptVersion: versions.prompt,
                      pairs,
                      sigmaScale: RETEST_SIGMA_SCALE,
                      quota,
                  });
        const reportId =
            report === null
                ? null
                : await this.writeReport(
                      data.domain,
                      versions,
                      report,
                      pairs,
                      now,
                  );
        const result: CallReportRetestResult = {
            domain: data.domain,
            promptVersion: versions.prompt,
            candidates: candidates.length,
            sampled: sample.length,
            rerun,
            reused: pairs.length - rerun,
            pairs: pairs.length,
            reportId,
            sigmaLlm:
                report === null
                    ? null
                    : {
                          value: report.sigmaLlm.value,
                          source: report.sigmaLlm.source,
                      },
            timeBudgetHit,
            elapsedMs: Date.now() - startedAt,
        };
        this.logger.log(
            `Test-retest ${data.domain} (${versions.prompt}): пар ${result.pairs}, ` +
                `повторено ${rerun}, из прошлых ${result.reused}, отчёт ${reportId ?? '—'}`,
        );

        return result;
    }

    /** Разборы текущей версии промпта за окно, последняя запись на звонок, свежие первыми. */
    private async candidates(
        domain: string,
        versions: AnalysisVersions,
        now: Date,
    ): Promise<RetestRecord[]> {
        const from = new Date(
            now.getTime() - RETEST_DEFAULTS.lookbackDays * 24 * 60 * 60 * 1000,
        );
        const records = await this.aiService.findByDomainTypesInPeriod(
            domain,
            [AGENT_ANALYSIS_TYPE],
            from,
            now,
        );
        const current = records.filter(
            record => promptVersionOf(record.user_result) === versions.prompt,
        );

        return [...latestPerTranscription(current).values()].sort(
            (a, b) => Number(b.id) - Number(a.id),
        );
    }

    /** Повторы прошлых запусков той же версии по транскрипциям выборки. */
    private async existingReruns(
        sample: readonly RetestRecord[],
        promptVersion: string,
    ): Promise<Map<string, unknown>> {
        const ids = sample.flatMap(record =>
            record.transcription_id === null ? [] : [record.transcription_id],
        );
        if (ids.length === 0) return new Map();
        const records = await this.aiService.findByTranscriptionIds(ids);
        const reruns = records.filter(
            record =>
                record.type === AGENT_ANALYSIS_RETEST_TYPE &&
                promptVersionOf(record.user_result) === promptVersion,
        );

        return new Map(
            [...latestPerTranscription(reruns).entries()].map(
                ([key, record]) => [key, record.user_result as unknown],
            ),
        );
    }

    /** Повторный разбор одного звонка; сбой или пустой ответ — null. */
    private async rerun(
        original: RetestRecord,
        versions: AnalysisVersions,
        model: string | null,
    ): Promise<unknown> {
        const transcriptionId = original.transcription_id as string;
        try {
            const row =
                await this.transcriptionStore.findPipelineById(transcriptionId);
            const transcript =
                renderTranscriptWithTimecodes(row.segments ?? []) ||
                (row.text ?? '');
            if (!transcript.trim()) return null;
            const source = original.user_result as Record<string, unknown>;
            const callType =
                typeof source.classifierCallType === 'string'
                    ? source.classifierCallType
                    : typeof source.callType === 'string'
                      ? source.callType
                      : null;
            const dto = await this.focusAnalysis.run(
                row.domain as string,
                transcript,
                callType,
                await this.passportBlock(row),
                model === null ? undefined : { model },
            );
            if (dto === null) return null;
            const payload = JSON.parse(
                JSON.stringify({
                    ...dto,
                    versions,
                    retestOf: original.id,
                    agentName: RETEST_DEFAULTS.provider,
                }),
            ) as Prisma.JsonValue;
            await this.aiService.create({
                provider: RETEST_DEFAULTS.provider,
                model: model ?? RETEST_DEFAULTS.provider,
                type: AGENT_ANALYSIS_RETEST_TYPE,
                status: 'done',
                result: dto.summary,
                user_result: payload,
                activity_id: row.activityId ?? undefined,
                entity_type: row.entityType ?? undefined,
                entity_id: row.entityId ? Number(row.entityId) : undefined,
                domain: row.domain as string,
                app: RETEST_DEFAULTS.app,
                transcription_id: row.id,
            });

            return payload;
        } catch (error) {
            this.logger.warn(
                `Повтор разбора ${transcriptionId} не удался: ${(error as Error).message}`,
            );

            return null;
        }
    }

    /** Паспорт звонка тем же построителем, что у штатного разбора; сбой — без паспорта. */
    private async passportBlock(
        row: TranscriptionPipelineView,
    ): Promise<string | undefined> {
        try {
            const passport = await this.contextBuilder.build(row);

            return this.contextBuilder.renderForPrompt(passport) || undefined;
        } catch {
            return undefined;
        }
    }

    /** Отчёт согласия конвертом снапшота; прежняя запись версии — superseded. */
    private async writeReport(
        domain: string,
        versions: AnalysisVersions,
        report: GoldenReport,
        pairs: readonly AgreementPair[],
        now: Date,
    ): Promise<string> {
        const periodKey = promptKeyOf(versions.prompt);
        const previous = await this.aiService.findByDomainTypeKeys(
            domain,
            AI_ANALYTICS_GOLDEN_REPORT_TYPE,
            { activityIds: [periodKey] },
        );
        for (const record of previous) {
            if (record.status === 'superseded') continue;
            await this.aiService
                .update(record.id, { status: 'superseded' })
                .catch((error: Error) =>
                    this.logger.warn(
                        `Прежний отчёт согласия ${record.id} не помечен: ${error.message}`,
                    ),
                );
        }
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_SNAPSHOT_PROVIDER,
            app: AI_ANALYTICS_SNAPSHOT_APP,
            model: RETEST_DEFAULTS.calcVersion,
            type: AI_ANALYTICS_GOLDEN_REPORT_TYPE,
            status: 'done',
            activity_id: periodKey,
            domain,
            user_result: JSON.parse(
                JSON.stringify({
                    managerId: null,
                    paramsVersion: versions.prompt,
                    inputsHash: pairsHashOf(pairs),
                    generatedAt: now.toISOString(),
                    payload: report,
                }),
            ) as Prisma.JsonValue,
        });

        return String(created.id);
    }

    /** Хэш реестра типов домена; реестр недоступен — builtin (как в процессоре). */
    private async registryHash(domain: string): Promise<string> {
        try {
            const registry = await this.callTypeRegistry.resolve(domain);

            return buildRegistryHash(registry.codes);
        } catch (error) {
            this.logger.warn(
                `Реестр типов недоступен (${domain}): ${(error as Error).message}`,
            );

            return CALL_REPORT_REGISTRY_BUILTIN;
        }
    }
}
