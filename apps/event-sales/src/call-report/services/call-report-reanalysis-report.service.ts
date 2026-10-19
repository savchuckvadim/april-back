/**
 * Записи ais переразбора истории (этап 1B): запись-статус прогона
 * (`call-report-reanalysis-run`, ключ `${from}..${to}`, обновляется в
 * месте) и отчёт согласия старой и новой версии промпта
 * (`ai-analytics-version-agreement`, ключ `${старая серия}->${версия}`,
 * конверт снапшота, прежняя запись ключа — superseded).
 *
 * `@Injectable` без bitrix-состояния: только AiService.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import {
    AGENT_ANALYSIS_TYPE,
    AI_RECORD_SUPERSEDED_STATUS,
    AiService,
    pickActiveRecord,
    type AiEntityDto,
} from '@lib/call-lib';
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    AI_ANALYTICS_VERSION_AGREEMENT_TYPE,
    buildVersionAgreementReport,
    CALL_REPORT_REANALYSIS_RUN_TYPE,
    isReanalysisRunStatusLike,
    REANALYSIS_DEFAULTS,
    REANALYSIS_PROVIDER,
    reanalysisRunKey,
    type AnalysisVersions,
    type ReanalysisRunStatus,
    type VersionAgreementPair,
    type VersionAgreementReport,
} from '@lib/sales-ai-analytics';
import { pairsBySeries } from '../use-cases/call-report-reanalyze.record';
import {
    pairsHashOf,
    RETEST_SECTION_SCALE_PREFIX,
    RETEST_SIGMA_SCALE,
} from '../use-cases/call-report-retest.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Статус прогона с id его записи ais. */
export interface ReanalysisStatusRecord {
    id: string;
    status: ReanalysisRunStatus;
}

@Injectable()
export class CallReportReanalysisReportService {
    private readonly logger = new Logger(
        CallReportReanalysisReportService.name,
    );

    constructor(private readonly aiService: AiService) {}

    /** Активная запись статуса периода; нет или чужая форма — null. */
    async loadStatus(
        domain: string,
        from: string,
        to: string,
    ): Promise<ReanalysisStatusRecord | null> {
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            CALL_REPORT_REANALYSIS_RUN_TYPE,
            { activityIds: [reanalysisRunKey(from, to)] },
        );
        const record = pickActiveRecord(records);
        if (record === null || !isReanalysisRunStatusLike(record.user_result)) {
            return null;
        }
        return { id: record.id, status: record.user_result };
    }

    /** Создать запись статуса или обновить существующую в месте; возвращает id. */
    async saveStatus(
        status: ReanalysisRunStatus,
        existingId: string | null,
    ): Promise<string> {
        const payload = JSON.parse(JSON.stringify(status)) as Prisma.JsonValue;
        if (existingId !== null) {
            await this.aiService.update(existingId, { user_result: payload });
            return existingId;
        }
        const created = await this.aiService.create({
            provider: REANALYSIS_PROVIDER,
            app: REANALYSIS_DEFAULTS.app,
            model: REANALYSIS_DEFAULTS.calcVersion,
            type: CALL_REPORT_REANALYSIS_RUN_TYPE,
            status: 'done',
            activity_id: reanalysisRunKey(status.from, status.to),
            domain: status.domain,
            user_result: payload,
        });
        return String(created.id);
    }

    /** Все записи agent-analysis по транскрипциям окна (включая superseded). */
    async loadAnalyses(
        domain: string,
        transcriptionIds: readonly string[],
    ): Promise<AiEntityDto[]> {
        if (transcriptionIds.length === 0) return [];
        return this.aiService.findByDomainTypeKeys(
            domain,
            AGENT_ANALYSIS_TYPE,
            {
                transcriptionIds: [...transcriptionIds],
            },
        );
    }

    /** Недавние разборы домена с учётом токенов — база оценки dryRun. */
    async recentUsage(
        domain: string,
        now: Date,
    ): Promise<{ tokens_count: number; price: number }[]> {
        const from = new Date(
            now.getTime() - REANALYSIS_DEFAULTS.estimateLookbackDays * DAY_MS,
        );
        return this.aiService.findByDomainTypesInPeriod(
            domain,
            [AGENT_ANALYSIS_TYPE],
            from,
            now,
        );
    }

    /**
     * Отчёты согласия версий по парам окна — по одному на старую серию
     * промпта; пар нет — ничего не пишется. Возвращает id записей.
     */
    async writeAgreementReports(
        domain: string,
        transcriptionIds: readonly string[],
        versions: AnalysisVersions,
        now: Date,
    ): Promise<string[]> {
        const records = await this.loadAnalyses(domain, transcriptionIds);
        const ids: string[] = [];
        for (const [series, pairs] of pairsBySeries(records)) {
            const report = buildVersionAgreementReport({
                fromSeries: series,
                toPromptVersion: versions.prompt,
                pairs,
                sigmaScale: RETEST_SIGMA_SCALE,
                sectionScalePrefix: RETEST_SECTION_SCALE_PREFIX,
            });
            ids.push(await this.writeAgreement(domain, report, pairs, now));
        }
        return ids;
    }

    /**
     * Отчёт согласия версий конвертом снапшота; прежние активные записи
     * того же ключа — superseded. Возвращает id новой записи.
     */
    async writeAgreement(
        domain: string,
        report: VersionAgreementReport,
        pairs: readonly VersionAgreementPair[],
        now: Date,
    ): Promise<string> {
        const previous = await this.aiService.findByDomainTypeKeys(
            domain,
            AI_ANALYTICS_VERSION_AGREEMENT_TYPE,
            { activityIds: [report.key] },
        );
        for (const record of previous) {
            if (record.status === AI_RECORD_SUPERSEDED_STATUS) continue;
            await this.aiService
                .update(record.id, { status: AI_RECORD_SUPERSEDED_STATUS })
                .catch((error: Error) =>
                    this.logger.warn(
                        `Прежний отчёт согласия версий ${record.id} не помечен: ${error.message}`,
                    ),
                );
        }
        const created = await this.aiService.create({
            provider: AI_ANALYTICS_SNAPSHOT_PROVIDER,
            app: AI_ANALYTICS_SNAPSHOT_APP,
            model: REANALYSIS_DEFAULTS.calcVersion,
            type: AI_ANALYTICS_VERSION_AGREEMENT_TYPE,
            status: 'done',
            activity_id: report.key,
            domain,
            user_result: JSON.parse(
                JSON.stringify({
                    managerId: null,
                    paramsVersion: report.toPromptVersion,
                    inputsHash: pairsHashOf(pairs),
                    generatedAt: now.toISOString(),
                    payload: report,
                }),
            ) as Prisma.JsonValue,
        });
        return String(created.id);
    }
}
