import { Injectable } from '@nestjs/common';
import { StructuredLlmGateway } from '@lib/llm-gateway';
import {
    buildNarrativeUserContent,
    OWNER_REPORT_NARRATIVE_SCHEMA,
    OWNER_REPORT_NARRATIVE_SCHEMA_NAME,
    OWNER_REPORT_NARRATIVE_SYSTEM_PROMPT,
    type OwnerReportText,
} from '@lib/sales-ai-analytics';
import type {
    OwnerReportNarrativePort,
    OwnerReportNarrativeResult,
} from './owner-report-narrative.port';

/**
 * Адаптер порта текста отчёта на шлюз структурных LLM-вызовов: провайдер
 * по настройкам портала (VibeCode, OpenAI-совместимый, ai-rag), strict
 * JSON по схеме OWNER_REPORT_NARRATIVE_SCHEMA. Ошибка вызова наружу не
 * глушится — её обрабатывает джоба (отчёт остаётся шаблонным).
 */
@Injectable()
export class LlmGatewayNarrativeAdapter implements OwnerReportNarrativePort {
    constructor(private readonly llm: StructuredLlmGateway) {}

    async complete(
        domain: string,
        text: OwnerReportText,
    ): Promise<OwnerReportNarrativeResult> {
        const response = await this.llm.structuredCompletionWithUsage(
            OWNER_REPORT_NARRATIVE_SYSTEM_PROMPT,
            buildNarrativeUserContent(text),
            OWNER_REPORT_NARRATIVE_SCHEMA_NAME,
            OWNER_REPORT_NARRATIVE_SCHEMA,
            domain,
        );
        return {
            payload: response.result,
            provider: response.provider,
            model: response.model,
            tokens: response.usage.totalTokens,
        };
    }
}
