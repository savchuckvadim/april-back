import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { CallSalesAnalysisResultDto } from './dto/call-sales-analysis.dto';
import { CallClassificationResultDto } from './dto/call-classification.dto';
import {
    ANALYSIS_SYSTEM_PROMPT,
    CALL_ANALYSIS_SCHEMA,
} from './contracts/call-analysis.contract';
import {
    CALL_CLASSIFICATION_SCHEMA,
    CLASSIFICATION_TRANSCRIPT_LIMIT,
    DEFAULT_CLASSIFICATION_SYSTEM_PROMPT,
} from './contracts/call-classification.contract';

interface VibecodeTranscriptionResponse {
    text?: string;
}

interface VibecodeChatCompletionsResponse {
    choices?: { message?: { content?: string } }[];
}

const VIBECODE_BASE_URL = 'https://vibecode.bitrix24.tech/v1';
const TRANSCRIPTION_MODEL = 'bitrix/deepdml/faster-whisper-large-v3-turbo-ct2';
const ANALYSIS_MODEL = 'bitrix/bitrixgpt-5.5';

/**
 * Клиент VibeCode API (vibecode.bitrix24.tech).
 *
 * Ключ — ТОЛЬКО пер-портальный vibeKey из БД (Portal.keys.vibeKey):
 * вызывающие резолвят его через VibeKeyResolverService по domain и
 * передают параметром apiKey в каждый метод. Env-переменной ключа
 * больше нет (BITRIX_VIBE_TEST выпилен 2026-07-23).
 */
@Injectable()
export class VibeCodeClient {
    private readonly logger = new Logger(VibeCodeClient.name);
    /** Таймаут запроса транскрибации: длинные файлы Whisper обрабатывает минутами. */
    private readonly transcriptionTimeoutMs: number;
    /** Таймаут запроса анализа (chat/completions). */
    private readonly analysisTimeoutMs: number;

    constructor(private readonly configService: ConfigService) {
        this.transcriptionTimeoutMs = Number(
            this.configService.get<string>('VIBECODE_TRANSCRIBE_TIMEOUT_MS') ??
                600_000,
        );
        this.analysisTimeoutMs = Number(
            this.configService.get<string>('VIBECODE_ANALYSIS_TIMEOUT_MS') ??
                180_000,
        );
    }

    async transcribeAudio(
        buffer: Buffer,
        fileName: string,
        apiKey: string,
    ): Promise<string> {
        this.logger.log(
            `Transcribing audio: ${fileName} (${buffer.length} bytes)`,
        );

        const formData = new FormData();
        formData.append('model', TRANSCRIPTION_MODEL);
        formData.append(
            'file',
            new Blob([buffer], { type: 'audio/mpeg' }),
            fileName,
        );

        const response = await fetch(
            `${VIBECODE_BASE_URL}/audio/transcriptions`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}` },
                body: formData,
                signal: AbortSignal.timeout(this.transcriptionTimeoutMs),
            },
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Vibecode transcription failed [${response.status}]: ${error}`,
            );
        }

        const data = (await response.json()) as VibecodeTranscriptionResponse;
        if (!data.text) {
            throw new Error('Empty transcription result from Vibecode');
        }

        this.logger.log(
            `Transcription done, length: ${data.text.length} chars`,
        );
        return data.text;
    }

    async analyzeTranscript(
        transcript: string,
        apiKey: string,
    ): Promise<CallSalesAnalysisResultDto> {
        this.logger.log('Analyzing transcript with Vibecode LLM');
        const parsed = await this.chatCompletionJson(
            ANALYSIS_SYSTEM_PROMPT,
            `Проанализируй следующую расшифровку звонка:\n\n${transcript}`,
            'call_sales_analysis',
            CALL_ANALYSIS_SCHEMA,
            apiKey,
        );
        return plainToInstance(CallSalesAnalysisResultDto, parsed);
    }

    /**
     * Дешёвая классификация звонка (tier-1): тип звонка + роль собеседника
     * + уверенность. Выполняется в начале конвейера call-report; длинный
     * транскрипт обрезается — для классификации хватает начала разговора.
     *
     * systemPrompt — подменная инструкция классификации (из базы знаний
     * kind='call-classify'); коды ответа при этом фиксированы strict
     * JSON-схемой, инструкция меняет только критерии их выбора.
     */
    async classifyCall(
        transcript: string,
        systemPrompt: string | undefined,
        apiKey: string,
    ): Promise<CallClassificationResultDto> {
        this.logger.log('Classifying call with Vibecode LLM');
        const trimmed =
            transcript.length > CLASSIFICATION_TRANSCRIPT_LIMIT
                ? transcript.slice(0, CLASSIFICATION_TRANSCRIPT_LIMIT)
                : transcript;
        const parsed = await this.chatCompletionJson(
            systemPrompt ?? DEFAULT_CLASSIFICATION_SYSTEM_PROMPT,
            `Классифицируй звонок по расшифровке:\n\n${trimmed}`,
            'call_classification',
            CALL_CLASSIFICATION_SCHEMA,
            apiKey,
        );
        return plainToInstance(CallClassificationResultDto, parsed);
    }

    /** Общий вызов chat/completions со strict JSON-схемой ответа. */
    private async chatCompletionJson(
        systemPrompt: string,
        userContent: string,
        schemaName: string,
        schema: Record<string, unknown>,
        apiKey: string,
    ): Promise<unknown> {
        const body = {
            model: ANALYSIS_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: schemaName,
                    strict: true,
                    schema,
                },
            },
        };

        const response = await fetch(`${VIBECODE_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.analysisTimeoutMs),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(
                `Vibecode ${schemaName} failed [${response.status}]: ${error}`,
            );
        }

        const data = (await response.json()) as VibecodeChatCompletionsResponse;
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error(`Empty ${schemaName} result from Vibecode`);
        }
        return JSON.parse(content) as unknown;
    }
}
