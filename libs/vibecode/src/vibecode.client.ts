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
    /** Сегменты `verbose_json` (start/end/text); нет — обычный ответ. */
    segments?: unknown;
}

/** Текст и сырые сегменты Whisper; segments null — провайдер их не дал. */
export interface VibecodeTranscriptionDetailed {
    text: string;
    segments: unknown;
}

/** Ответ 4xx на `verbose_json` — формат не поддержан, повторяем без него. */
const isClientError = (error: unknown): boolean =>
    /\[4\d\d\]/.test((error as Error)?.message ?? '');

interface VibecodeChatCompletionsResponse {
    choices?: { message?: { content?: string } }[];
    /**
     * OpenAI-совместимый учёт токенов. В документации VibeCode поле не
     * описано — читаем защитно: нет поля или не число, значит null.
     */
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
    /** Фактическая модель из ответа (может отличаться от запрошенной). */
    model?: string;
}

/** Расход токенов одного вызова chat/completions; null — API поле не вернул. */
export interface VibecodeCompletionUsage {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
}

/** Результат strict-JSON вызова вместе с учётом токенов и фактической моделью. */
export interface VibecodeStructuredCompletionWithUsage {
    /** Разобранный JSON по схеме вызывающего (тот же, что отдаёт structuredCompletion). */
    result: unknown;
    usage: VibecodeCompletionUsage;
    /** Модель из ответа API; null — не вернул. */
    model: string | null;
}

/** Опции strict-JSON вызова. */
export interface VibecodeStructuredCompletionOptions {
    /** Модель VibeCode вместо дефолтной (например, из настроек портала). */
    model?: string;
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
        return (await this.transcribeAudioDetailed(buffer, fileName, apiKey))
            .text;
    }

    /**
     * Транскрибация с сегментами (`response_format=verbose_json`, П6).
     * Прокси, не знающий формата, отвечает 4xx — тогда один повтор без
     * него; таймауты и 5xx наружу (fallback на Yandex решает роутер).
     */
    async transcribeAudioDetailed(
        buffer: Buffer,
        fileName: string,
        apiKey: string,
    ): Promise<VibecodeTranscriptionDetailed> {
        try {
            return await this.postTranscription(
                buffer,
                fileName,
                apiKey,
                'verbose_json',
            );
        } catch (error) {
            if (!isClientError(error)) throw error;
            this.logger.warn(
                `verbose_json не принят (${(error as Error).message}) — повтор без сегментов`,
            );

            return this.postTranscription(buffer, fileName, apiKey, null);
        }
    }

    private async postTranscription(
        buffer: Buffer,
        fileName: string,
        apiKey: string,
        responseFormat: 'verbose_json' | null,
    ): Promise<VibecodeTranscriptionDetailed> {
        this.logger.log(
            `Transcribing audio: ${fileName} (${buffer.length} bytes)`,
        );

        const formData = new FormData();
        formData.append('model', TRANSCRIPTION_MODEL);
        if (responseFormat !== null) {
            formData.append('response_format', responseFormat);
        }
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
        return { text: data.text, segments: data.segments ?? null };
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
     * kind='call-classify'); allowedCallTypes — динамический список кодов
     * из реестра типов (общие + клиентские): enum схемы строится из него,
     * иначе — встроенные коды контракта.
     */
    async classifyCall(
        transcript: string,
        systemPrompt: string | undefined,
        apiKey: string,
        allowedCallTypes?: string[],
    ): Promise<CallClassificationResultDto> {
        this.logger.log(
            `Classifying call with Vibecode LLM (${allowedCallTypes?.length ?? 'builtin'} types)`,
        );
        // Длинный разговор: берём НАЧАЛО и КОНЕЦ, а не только начало —
        // презентация, решение и закрытие на дату проявляются ближе к
        // концу, и обрезка по началу превращала их в «другое».
        const trimmed = sampleTranscriptForClassification(
            transcript,
            CLASSIFICATION_TRANSCRIPT_LIMIT,
        );
        const parsed = await this.chatCompletionJson(
            systemPrompt ?? DEFAULT_CLASSIFICATION_SYSTEM_PROMPT,
            `Классифицируй звонок по расшифровке:\n\n${trimmed}`,
            'call_classification',
            this.buildClassificationSchema(allowedCallTypes),
            apiKey,
        );
        return plainToInstance(CallClassificationResultDto, parsed);
    }

    /** Схема классификации с динамическим enum типов из реестра. */
    // (сэмплирование транскрипта — sampleTranscriptForClassification ниже)
    private buildClassificationSchema(
        allowedCallTypes?: string[],
    ): Record<string, unknown> {
        if (!allowedCallTypes?.length) return CALL_CLASSIFICATION_SCHEMA;
        const schema = JSON.parse(
            JSON.stringify(CALL_CLASSIFICATION_SCHEMA),
        ) as {
            properties: { callType: { enum: string[] } };
        };
        schema.properties.callType.enum = allowedCallTypes;
        return schema as unknown as Record<string, unknown>;
    }

    /**
     * Произвольный strict-JSON вызов: схему и промпт задаёт вызывающий
     * модуль. Нужен там, где состав ответа — предметная область прикладного
     * кода, а не транспорта (глубокий разбор звонка по разделам смарта:
     * коды разделов живут в portal-lib, тянуть его в клиент нельзя).
     */
    async structuredCompletion(
        systemPrompt: string,
        userContent: string,
        schemaName: string,
        schema: Record<string, unknown>,
        apiKey: string,
        options?: VibecodeStructuredCompletionOptions,
    ): Promise<unknown> {
        return this.chatCompletionJson(
            systemPrompt,
            userContent,
            schemaName,
            schema,
            apiKey,
            options?.model,
        );
    }

    /**
     * То же, что structuredCompletion, но вместе с учётом токенов (usage)
     * и моделью из ответа — для записи ais.tokens_count / price
     * (AI-резюме отчёта ОП, план ai-sales-analytics §8). Если VibeCode
     * usage не вернул — null-поля; оценку по длине делает вызывающий.
     */
    async structuredCompletionWithUsage(
        systemPrompt: string,
        userContent: string,
        schemaName: string,
        schema: Record<string, unknown>,
        apiKey: string,
        options?: VibecodeStructuredCompletionOptions,
    ): Promise<VibecodeStructuredCompletionWithUsage> {
        return this.chatCompletionWithUsage(
            systemPrompt,
            userContent,
            schemaName,
            schema,
            apiKey,
            options?.model,
        );
    }

    /** Общий вызов chat/completions со strict JSON-схемой: только разобранный результат. */
    private async chatCompletionJson(
        systemPrompt: string,
        userContent: string,
        schemaName: string,
        schema: Record<string, unknown>,
        apiKey: string,
        model?: string,
    ): Promise<unknown> {
        const { result } = await this.chatCompletionWithUsage(
            systemPrompt,
            userContent,
            schemaName,
            schema,
            apiKey,
            model,
        );
        return result;
    }

    /** Общий вызов chat/completions со strict JSON-схемой ответа + usage/model. */
    private async chatCompletionWithUsage(
        systemPrompt: string,
        userContent: string,
        schemaName: string,
        schema: Record<string, unknown>,
        apiKey: string,
        model?: string,
    ): Promise<VibecodeStructuredCompletionWithUsage> {
        const body = {
            model: model?.trim() || ANALYSIS_MODEL,
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
        return {
            result: JSON.parse(content) as unknown,
            usage: parseCompletionUsage(data.usage),
            model: typeof data.model === 'string' ? data.model : null,
        };
    }
}

/** Число токенов из ответа: только конечное число, иначе null. */
function toTokenCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseCompletionUsage(
    usage: VibecodeChatCompletionsResponse['usage'],
): VibecodeCompletionUsage {
    return {
        promptTokens: toTokenCount(usage?.prompt_tokens),
        completionTokens: toTokenCount(usage?.completion_tokens),
        totalTokens: toTokenCount(usage?.total_tokens),
    };
}

/**
 * Выжимка длинного транскрипта под лимит классификатора: две трети —
 * начало разговора (кто, зачем, контекст), треть — конец (чем закончили:
 * показ, решение, дата). Середина помечается пропуском.
 */
export function sampleTranscriptForClassification(
    transcript: string,
    limit: number,
): string {
    if (transcript.length <= limit) return transcript;
    const headChars = Math.floor(limit * 0.66);
    const tailChars = limit - headChars;
    return (
        transcript.slice(0, headChars) +
        '\n\n[… середина разговора пропущена …]\n\n' +
        transcript.slice(-tailChars)
    );
}
