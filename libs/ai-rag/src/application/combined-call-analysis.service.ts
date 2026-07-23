import { Injectable, Logger } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseRetrieverInterface } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import {
    COMBINED_ANALYSIS_SYSTEM_PROMPT,
    COMBINED_RECOMENDATION_MARKER,
    COMBINED_RESUME_MARKER,
} from '../domain/prompts/prompts';
import { CallAnalysisPair } from '../domain/interfaces/llm-provider.interface';
import { extractMessageContent } from './extract-message-content.util';

/** RAG-kind знаний, участвующие в объединённом анализе. */
export type CombinedAnalysisKind = 'resume' | 'recomendation';

export interface CombinedAnalysisParams {
    llm: BaseChatModel;
    /** Фабрика ретривера знаний по kind; ошибка kind'а не роняет анализ. */
    getRetriever: (
        kind: CombinedAnalysisKind,
    ) => Promise<BaseRetrieverInterface>;
    transcript: string;
}

/**
 * Разбирает объединённый ответ LLM на пару резюме/рекомендации по маркерам.
 * null — ответ не соответствует контракту (провайдер уходит в fallback
 * на два раздельных вызова).
 */
export function parseCombinedAnalysis(text: string): CallAnalysisPair | null {
    const resumeIndex = text.indexOf(COMBINED_RESUME_MARKER);
    const recomendationIndex = text.indexOf(COMBINED_RECOMENDATION_MARKER);
    if (
        resumeIndex === -1 ||
        recomendationIndex === -1 ||
        recomendationIndex <= resumeIndex
    ) {
        return null;
    }
    const resume = text
        .slice(resumeIndex + COMBINED_RESUME_MARKER.length, recomendationIndex)
        .trim();
    const recomendation = text
        .slice(recomendationIndex + COMBINED_RECOMENDATION_MARKER.length)
        .trim();
    if (!resume || !recomendation) return null;
    return { resume, recomendation };
}

/**
 * Объединённый анализ звонка одним вызовом LLM: контексты знаний обоих
 * kind (resume + recomendation) собираются в один системный промпт,
 * ответ разрезается по маркерам. Общая логика для всех провайдеров —
 * провайдер отдаёт только llm и фабрику ретриверов.
 */
@Injectable()
export class CombinedCallAnalysisService {
    private readonly logger = new Logger(CombinedCallAnalysisService.name);

    /** @throws если LLM не вернул распарсиваемый двухсекционный ответ. */
    async run(params: CombinedAnalysisParams): Promise<CallAnalysisPair> {
        const context = await this.buildContext(params);
        const system = COMBINED_ANALYSIS_SYSTEM_PROMPT.replace(
            '{context}',
            context,
        );
        const response = await params.llm.invoke([
            new SystemMessage(system),
            new HumanMessage(params.transcript),
        ]);
        const text = extractMessageContent(response);
        const pair = parseCombinedAnalysis(text);
        if (!pair) {
            throw new Error(
                'Объединённый анализ: ответ LLM без маркеров секций',
            );
        }
        return pair;
    }

    /**
     * Контекст знаний из обоих kind'ов; отсутствие материалов одного kind
     * (нет загруженных документов) — не ошибка, просто пустой контекст.
     */
    private async buildContext(
        params: CombinedAnalysisParams,
    ): Promise<string> {
        const kinds: CombinedAnalysisKind[] = ['resume', 'recomendation'];
        const parts: string[] = [];
        for (const kind of kinds) {
            try {
                const retriever = await params.getRetriever(kind);
                const docs: Document[] = await retriever.invoke(
                    params.transcript,
                );
                for (const doc of docs) {
                    if (doc.pageContent) parts.push(doc.pageContent);
                }
            } catch (error) {
                this.logger.warn(
                    `Контекст знаний kind=${kind} недоступен: ${(error as Error).message}`,
                );
            }
        }
        return Array.from(new Set(parts)).join('\n\n---\n\n');
    }
}
