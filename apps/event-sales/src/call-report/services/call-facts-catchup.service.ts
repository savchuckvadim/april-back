import { Injectable } from '@nestjs/common';
import {
    renderTranscriptWithTimecodes,
    TranscriptionStoreService,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import { StructuredLlmGateway } from '@lib/llm-gateway';
import {
    analysisUsageColumns,
    type AnalysisUsageColumns,
} from '../../agent-gate/services/agent-analysis-usage.util';
import { LlmPriceResolverService } from '../../agent-gate/services/llm-price-resolver.service';
import {
    buildFactsCatchupUserContent,
    FACTS_CATCHUP_PROMPT,
    FACTS_CATCHUP_SCHEMA,
    FACTS_CATCHUP_SCHEMA_NAME,
    parseFactsCatchupResult,
    type FactsCatchupResult,
} from '../contracts/call-report-facts-catchup.contract';
import { callTypeOfAnalysis } from './call-analysis-rerun.service';
import { sumCompletionUsage } from './call-analysis-usage.util';
import { CallContextBuilderService } from './call-context-builder.service';

export interface CallFactsCatchupInput {
    transcriptionId: string;
    /** user_result имеющегося разбора — тип звонка и контекст для модели. */
    source: Record<string, unknown>;
    /** Модель портала (deepAnalysisModel); null — по умолчанию шлюза. */
    model: string | null;
}

export interface CallFactsCatchupOutcome {
    row: TranscriptionPipelineView;
    facts: FactsCatchupResult;
    /** Колонки расхода ais (tokens_count / price); без учёта — пусто. */
    usage: AnalysisUsageColumns;
    model: string | null;
    provider: string;
}

/**
 * Один короткий вызов модели за фактами v3.1 по сохранённой расшифровке
 * (этап B4): та же расшифровка с таймкодами и тот же паспорт звонка, что у
 * штатного разбора, но единственный проход только по схеме фактов.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class CallFactsCatchupService {
    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly llm: StructuredLlmGateway,
        private readonly contextBuilder: CallContextBuilderService,
        private readonly llmPrice: LlmPriceResolverService,
    ) {}

    /**
     * null — пустая расшифровка или ответ модели не той формы. Ошибки
     * хранилища и шлюза пробрасываются — вызывающий считает их сбоем.
     */
    async run(
        input: CallFactsCatchupInput,
    ): Promise<CallFactsCatchupOutcome | null> {
        const row = await this.transcriptionStore.findPipelineById(
            input.transcriptionId,
        );
        const transcript =
            renderTranscriptWithTimecodes(row.segments ?? []) ||
            (row.text ?? '');
        if (!transcript.trim()) return null;
        const domain = row.domain as string;
        const response = await this.llm.structuredCompletionWithUsage(
            FACTS_CATCHUP_PROMPT,
            buildFactsCatchupUserContent(
                transcript,
                callTypeOfAnalysis(input.source),
                input.source,
                await this.passportBlock(row),
            ),
            FACTS_CATCHUP_SCHEMA_NAME,
            FACTS_CATCHUP_SCHEMA,
            domain,
            input.model === null ? undefined : { model: input.model },
        );
        const facts = parseFactsCatchupResult(response.result);
        if (facts === null) return null;
        const usage = analysisUsageColumns(
            sumCompletionUsage([response]),
            await this.llmPrice.resolvePricing(domain),
        );
        return {
            row,
            facts,
            usage,
            model: response.model,
            provider: response.provider,
        };
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
}
