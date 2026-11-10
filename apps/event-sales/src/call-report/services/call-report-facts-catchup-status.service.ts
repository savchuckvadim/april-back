import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import {
    AGENT_ANALYSIS_FACTS_TYPE,
    AiService,
    pickActiveRecord,
} from '@lib/call-lib';
import {
    CALL_REPORT_FACTS_CATCHUP_RUN_TYPE,
    FACTS_CATCHUP_DEFAULTS,
    FACTS_CATCHUP_PROMPT_VERSION,
    FACTS_CATCHUP_PROVIDER,
    factsCatchupRunKey,
    isFactsCatchupRunStatusLike,
    type FactsCatchupGroup,
    type FactsCatchupRunStatus,
} from '@lib/sales-ai-analytics';
import type { AnalysisUsageColumns } from '../../agent-gate/services/agent-analysis-usage.util';
import type { FactsCatchupResult } from '../contracts/call-report-facts-catchup.contract';
import type { ReanalysisRecordView } from '../use-cases/call-report-reanalyze.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Статус прогона с id его записи ais. */
export interface FactsCatchupStatusRecord {
    id: string;
    status: FactsCatchupRunStatus;
}

export interface FactsCatchupRecordInput {
    domain: string;
    transcriptionId: string;
    /** Активная запись разбора, в которую дописаны факты. */
    old: ReanalysisRecordView;
    facts: FactsCatchupResult;
    gaps: readonly FactsCatchupGroup[];
    usage: AnalysisUsageColumns;
    model: string | null;
    provider: string;
    at: string;
}

/**
 * Записи ais догона фактов (этап B4): запись-статус прогона
 * (`call-report-facts-catchup-run`, ключ `${from}..${to}`, обновляется в
 * месте) и запись расхода `agent-analysis-facts` на каждый догнанный
 * звонок — след прогона и токены текущим месяцем для панели расхода.
 *
 * `@Injectable` без bitrix-состояния: только AiService.
 */
@Injectable()
export class CallReportFactsCatchupStatusService {
    constructor(private readonly aiService: AiService) {}

    /** Активная запись статуса периода; нет или чужая форма — null. */
    async loadStatus(
        domain: string,
        from: string,
        to: string,
    ): Promise<FactsCatchupStatusRecord | null> {
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            CALL_REPORT_FACTS_CATCHUP_RUN_TYPE,
            { activityIds: [factsCatchupRunKey(from, to)] },
        );
        const record = pickActiveRecord(records);
        if (
            record === null ||
            !isFactsCatchupRunStatusLike(record.user_result)
        ) {
            return null;
        }
        return { id: record.id, status: record.user_result };
    }

    /** Создать запись статуса или обновить существующую в месте; возвращает id. */
    async saveStatus(
        status: FactsCatchupRunStatus,
        existingId: string | null,
    ): Promise<string> {
        const payload = JSON.parse(JSON.stringify(status)) as Prisma.JsonValue;
        if (existingId !== null) {
            await this.aiService.update(existingId, { user_result: payload });
            return existingId;
        }
        const created = await this.aiService.create({
            provider: FACTS_CATCHUP_PROVIDER,
            app: FACTS_CATCHUP_DEFAULTS.app,
            model: FACTS_CATCHUP_DEFAULTS.calcVersion,
            type: CALL_REPORT_FACTS_CATCHUP_RUN_TYPE,
            status: 'done',
            activity_id: factsCatchupRunKey(status.from, status.to),
            domain: status.domain,
            user_result: payload,
        });
        return String(created.id);
    }

    /** Недавние записи расхода догона — база оценки dryRun. */
    async recentFactsUsage(
        domain: string,
        now: Date,
    ): Promise<{ tokens_count: number; price: number }[]> {
        const from = new Date(
            now.getTime() -
                FACTS_CATCHUP_DEFAULTS.estimateLookbackDays * DAY_MS,
        );
        return this.aiService.findByDomainTypesInPeriod(
            domain,
            [AGENT_ANALYSIS_FACTS_TYPE],
            from,
            now,
        );
    }

    /** Запись расхода и следа догона одного звонка; возвращает id. */
    async writeFactsRecord(input: FactsCatchupRecordInput): Promise<string> {
        const created = await this.aiService.create({
            provider: FACTS_CATCHUP_PROVIDER,
            app: FACTS_CATCHUP_DEFAULTS.app,
            model: input.model ?? FACTS_CATCHUP_PROMPT_VERSION,
            type: AGENT_ANALYSIS_FACTS_TYPE,
            status: 'done',
            domain: input.domain,
            transcription_id: input.transcriptionId,
            ...(input.old.user_id == null
                ? {}
                : { user_id: input.old.user_id }),
            ...(input.old.activity_id == null
                ? {}
                : { activity_id: input.old.activity_id }),
            ...input.usage,
            user_result: JSON.parse(
                JSON.stringify({
                    version: FACTS_CATCHUP_PROMPT_VERSION,
                    groups: input.gaps,
                    sourceRecordId: input.old.id,
                    provider: input.provider,
                    model: input.model,
                    at: input.at,
                    facts: input.facts,
                }),
            ) as Prisma.JsonValue,
        });
        return String(created.id);
    }
}
