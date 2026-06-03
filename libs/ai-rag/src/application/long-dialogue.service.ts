import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
    BaseMessage,
    HumanMessage,
    SystemMessage,
} from '@langchain/core/messages';
import { BaseRetrieverInterface } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import {
    RECOMMENDATION_SYSTEM_PROMPT,
    RESUME_SYSTEM_PROMPT,
} from '../domain/prompts/prompts';
import {
    AGGREGATE_RECOMMENDATION_PREFIX,
    AGGREGATE_RECOMMENDATION_SUFFIX,
    AGGREGATE_RECOMMENDATION_SYSTEM,
    AGGREGATE_RESUME_PREFIX,
    AGGREGATE_RESUME_SUFFIX,
    AGGREGATE_RESUME_SYSTEM,
    BLOCK_RECOMMENDATION_INSTRUCTIONS,
    BLOCK_RECOMMENDATION_SYSTEM,
    BLOCK_RESUME_INSTRUCTIONS,
    BLOCK_RESUME_SYSTEM,
    FINAL_RECOMMENDATION_PREFIX,
    FINAL_RECOMMENDATION_SUFFIX,
    SEGMENT_MAX_CHARS,
    SEGMENT_OVERLAP,
    SHORT_RAG_QUERY,
    TRANSCRIPT_CHAR_THRESHOLD,
} from '../domain/prompts/long-dialogue.prompts';
import { extractMessageContent } from './extract-message-content.util';

const CHUNK_THRESHOLD_ENV = 'GIGACHAT_CHUNK_TRANSCRIPT_OVER_CHARS';

@Injectable()
export class LongDialogueService {
    private readonly chunkThreshold: number;

    constructor(configService: ConfigService) {
        const raw = configService.get<string>(CHUNK_THRESHOLD_ENV);
        const parsed = raw ? Number.parseInt(raw, 10) : NaN;
        this.chunkThreshold =
            Number.isFinite(parsed) && parsed > 0
                ? parsed
                : TRANSCRIPT_CHAR_THRESHOLD;
    }

    needsChunkedProcessing(transcript: string): boolean {
        if (!transcript) return false;
        return transcript.trim().length > this.chunkThreshold;
    }

    segmentTranscript(
        text: string,
        maxLen: number = SEGMENT_MAX_CHARS,
        overlap: number = SEGMENT_OVERLAP,
    ): string[] {
        const t = text.trim();
        if (t.length <= maxLen) return [t];

        const chunks: string[] = [];
        const n = t.length;
        const halfWindow = Math.floor(maxLen / 2);
        let start = 0;

        while (start < n) {
            let end = Math.min(start + maxLen, n);
            if (end < n) {
                const windowStart = start + halfWindow;
                const window = t.substring(windowStart, end);
                let br = window.lastIndexOf('\n');
                if (br === -1) br = window.lastIndexOf(' ');
                if (br !== -1) {
                    const absBr = windowStart + br;
                    if (absBr > start) {
                        end = absBr + 1;
                    }
                }
            }
            const piece = t.substring(start, end).trim();
            if (piece) chunks.push(piece);
            if (end >= n) break;
            start = Math.max(start + 1, end - overlap);
        }

        return chunks.length > 0 ? chunks : [t];
    }

    async runResume(
        transcript: string,
        llm: BaseChatModel,
        retriever: BaseRetrieverInterface,
    ): Promise<string> {
        const context = await this.buildRagContext(retriever);
        const segments = this.segmentTranscript(transcript);
        const blockNotes = await this.collectBlockNotes(
            segments,
            llm,
            context,
            BLOCK_RESUME_SYSTEM,
            BLOCK_RESUME_INSTRUCTIONS,
            params => this.buildResumeBlockHuman(params),
        );

        const aggregated = await this.invokeChat(
            llm,
            AGGREGATE_RESUME_SYSTEM,
            AGGREGATE_RESUME_PREFIX +
                blockNotes.join('\n\n') +
                AGGREGATE_RESUME_SUFFIX,
        );

        const systemFull = RESUME_SYSTEM_PROMPT.replace('{context}', context);
        const finalHuman =
            'Ниже объединённые заметки по звонку (транскрипт обработан по частям). ' +
            'Сформируй итоговое резюме строго по правилам системного сообщения.\n\n' +
            aggregated;
        return this.invokeChat(llm, systemFull, finalHuman);
    }

    async runRecommendation(
        transcript: string,
        llm: BaseChatModel,
        retriever: BaseRetrieverInterface,
    ): Promise<string> {
        const context = await this.buildRagContext(retriever);
        const segments = this.segmentTranscript(transcript);
        const blockNotes = await this.collectBlockNotes(
            segments,
            llm,
            context,
            BLOCK_RECOMMENDATION_SYSTEM,
            BLOCK_RECOMMENDATION_INSTRUCTIONS,
            params => this.buildRecommendationBlockHuman(params),
        );

        const aggregated = await this.invokeChat(
            llm,
            AGGREGATE_RECOMMENDATION_SYSTEM,
            AGGREGATE_RECOMMENDATION_PREFIX +
                blockNotes.join('\n\n') +
                AGGREGATE_RECOMMENDATION_SUFFIX,
        );

        const systemFull = RECOMMENDATION_SYSTEM_PROMPT.replace(
            '{context}',
            context,
        );
        const finalHuman =
            FINAL_RECOMMENDATION_PREFIX +
            aggregated +
            FINAL_RECOMMENDATION_SUFFIX;
        return this.invokeChat(llm, systemFull, finalHuman);
    }

    private async buildRagContext(
        retriever: BaseRetrieverInterface,
    ): Promise<string> {
        const docs: Document[] = await retriever.invoke(SHORT_RAG_QUERY);
        const parts = docs
            .map(doc => doc.pageContent)
            .filter((content): content is string => Boolean(content));
        return parts.length > 0 ? parts.join('\n\n---\n\n') : '';
    }

    private async collectBlockNotes(
        segments: string[],
        llm: BaseChatModel,
        context: string,
        system: string,
        instructions: string,
        buildHuman: (params: BlockHumanParams) => string,
    ): Promise<string[]> {
        const total = segments.length;
        const notes: string[] = [];
        for (let i = 0; i < total; i++) {
            const human = buildHuman({
                context,
                segment: segments[i],
                index: i,
                total,
                instructions,
            });
            const text = await this.invokeChat(llm, system, human);
            notes.push(`=== Часть ${i + 1}/${total} ===\n${text}`);
        }
        return notes;
    }

    private buildResumeBlockHuman(params: BlockHumanParams): string {
        return (
            'Ты анализируешь ФРАГМЕНТ транскрипта телефонного звонка менеджера компании ГАРАНТ.\n' +
            'Ниже — выдержки из внутренних документов (контекст компании). ' +
            'Используй их только если релевантны.\n\n' +
            params.context +
            `\n\nФрагмент ${params.index + 1} из ${params.total}:\n---\n` +
            params.segment +
            '\n---\n\n' +
            params.instructions
        );
    }

    private buildRecommendationBlockHuman(params: BlockHumanParams): string {
        return (
            'Ты эксперт по продажам ИПО ГАРАНТ. Фрагмент транскрипта звонка.\n' +
            'Контекст из документов:\n' +
            params.context +
            `\n\nФрагмент ${params.index + 1} из ${params.total}:\n---\n` +
            params.segment +
            '\n---\n\n' +
            params.instructions
        );
    }

    private async invokeChat(
        llm: BaseChatModel,
        system: string,
        human: string,
    ): Promise<string> {
        const response: BaseMessage = await llm.invoke([
            new SystemMessage(system),
            new HumanMessage(human),
        ]);
        return extractMessageContent(response);
    }
}

interface BlockHumanParams {
    context: string;
    segment: string;
    index: number;
    total: number;
    instructions: string;
}
