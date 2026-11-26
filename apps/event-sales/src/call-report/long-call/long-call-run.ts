import {
    LlmUnavailableError,
    describeLlmError,
    isRetryableLlmError,
    type StructuredLlmGateway,
    type StructuredLlmResponse,
} from '@lib/llm-gateway';
import { Semaphore } from '@lib/shared';
import {
    CALL_LONG_PART_SCHEMA,
    CALL_LONG_PART_SCHEMA_NAME,
    buildCallLongPartPrompt,
    buildCallLongPartUserContent,
    isDigestSuspiciouslyEmpty,
    parseCallLongPartResponse,
} from '../contracts/call-long-part.contract';
import {
    CALL_LONG_SUMMARY_PROMPT,
    CALL_LONG_SUMMARY_SCHEMA,
    CALL_LONG_SUMMARY_SCHEMA_NAME,
    parseCallLongSummaryResponse,
} from '../contracts/call-long-summary.contract';
import type {
    LongCallCacheRequest,
    LongCallCacheRole,
    LongCallDigestCache,
} from './long-call-digest.cache';
import { buildDigestText } from './long-call-digest-text.util';
import { isRecord } from './long-call-parse.util';
import {
    LONG_CALL_MAX_ATTEMPTS,
    LONG_CALL_PART_CONCURRENCY,
} from './long-call-service.const';
import type {
    ConversationSummary,
    DigestedPart,
    PartDigest,
    TranscriptPart,
} from './long-call.types';

/**
 * Запросы к модели по одному длинному разговору: конспекты частей (не больше
 * трёх одновременно) и сводка. Один экземпляр — на один вызов prepare:
 * счётчики и собранные ответы принадлежат конкретному разговору, поэтому в
 * @Injectable-сервисе их держать нельзя.
 *
 * Правила запроса: кэш → до двух попыток. Повтор — на временную ошибку
 * поставщика, на ответ, который не разобрался, и (у конспекта части) на
 * «подозрительно пустой» конспект; если и повтор пуст — пустой принимаем.
 * Сам запрос не бросает: не вышло — null.
 *
 * Тревога «не ответил никто» — одна на разговор, а не на каждую часть: шлюзу
 * всегда говорим откладывать её (deferExhaustedAlert), первую такую ошибку
 * запоминаем, а сервис зовёт alertAbandoned только тогда, когда длинный путь
 * брошен. Не удалась одна часть или сводка, а путь состоялся — тревоги нет,
 * только предупреждения в журнале.
 */

/** Шлюз, как его видит запрос: вызов с расходом и тревога «не ответил никто». */
export type LongCallGateway = Pick<
    StructuredLlmGateway,
    'structuredCompletionWithUsage' | 'reportExhausted'
>;

/** Журнал: предупреждения о сбоях. */
export interface LongCallLogger {
    warn(message: string): void;
}

/** Одно задание модели. */
interface AskSpec<T> {
    role: LongCallCacheRole;
    /** Для журнала: «часть 3 из 7», «сводка разговора». */
    title: string;
    system: string;
    user: string;
    schema: Record<string, unknown>;
    /** Сырой ответ → результат; null — ответ не разобрался. */
    parse(raw: unknown): T | null;
    /**
     * Результат разобрался, но слабый (пустой конспект большой части):
     * повторить один раз, а если и повтор слабый — принять слабый. Слабый
     * результат в кэш не кладётся.
     */
    isWeak?(value: T): boolean;
}

export class LongCallRun {
    /** Ответы модели с расходом — только удавшиеся запросы, кэш сюда не входит. */
    readonly completions: StructuredLlmResponse[] = [];
    private sent = 0;
    private hits = 0;
    /** Первая ошибка «не ответил ни один поставщик» за разговор — для тревоги. */
    private firstUnavailable: LlmUnavailableError | null = null;

    constructor(
        private readonly gateway: LongCallGateway,
        private readonly cache: LongCallDigestCache,
        private readonly logger: LongCallLogger,
        private readonly domain: string,
        private readonly model: string | undefined,
    ) {}

    /** Сколько запросов ушло к модели, включая сорвавшиеся и повторы. */
    get requestsSent(): number {
        return this.sent;
    }

    /** Сколько ответов взято из кэша. */
    get cacheHits(): number {
        return this.hits;
    }

    /**
     * Конспекты всех частей по порядку частей; у части, которой не вышло, —
     * null. Одновременно идут не больше LONG_CALL_PART_CONCURRENCY частей;
     * счётчик слотов — свой на каждый вызов.
     */
    digestAll(
        parts: readonly TranscriptPart[],
        partChars: number,
    ): Promise<(PartDigest | null)[]> {
        const semaphore = new Semaphore(LONG_CALL_PART_CONCURRENCY);

        return Promise.all(
            parts.map(part =>
                semaphore.run(() => this.digestPart(part, partChars)),
            ),
        );
    }

    /**
     * Тревога «не ответил никто» — одна на разговор, по первой запомненной
     * ошибке отказа поставщиков. Зовёт сервис, когда длинный путь брошен; ошибки
     * не было — ничего не делает. Сбой самой тревоги разбор не меняет.
     */
    async alertAbandoned(): Promise<void> {
        if (this.firstUnavailable === null) return;
        try {
            await this.gateway.reportExhausted(this.firstUnavailable, {
                schemaName: CALL_LONG_PART_SCHEMA_NAME,
                domain: this.domain,
            });
        } catch (alertError) {
            this.logger.warn(
                `Длинный разговор (${this.domain}): тревога о сбое модели не отправлена: ${describeLlmError(alertError)}`,
            );
        }
    }

    /** Сводка разговора по конспектам частей; не вышла — null. */
    summarize(
        parts: readonly DigestedPart[],
    ): Promise<ConversationSummary | null> {
        const durationSec =
            parts.length > 0 ? parts[parts.length - 1].part.toSec : null;

        return this.ask({
            role: CALL_LONG_SUMMARY_SCHEMA_NAME,
            title: 'сводка разговора',
            system: CALL_LONG_SUMMARY_PROMPT,
            user: buildDigestText(parts),
            schema: CALL_LONG_SUMMARY_SCHEMA,
            parse: raw => parseCallLongSummaryResponse(raw, durationSec),
        });
    }

    private digestPart(
        part: TranscriptPart,
        partChars: number,
    ): Promise<PartDigest | null> {
        return this.ask({
            role: CALL_LONG_PART_SCHEMA_NAME,
            title: `часть ${part.number} из ${part.total}`,
            system: buildCallLongPartPrompt(part),
            user: buildCallLongPartUserContent(part),
            schema: CALL_LONG_PART_SCHEMA,
            parse: raw => parseCallLongPartResponse(raw, part),
            isWeak: digest =>
                isDigestSuspiciouslyEmpty(digest, part, partChars),
        });
    }

    private async ask<T>(spec: AskSpec<T>): Promise<T | null> {
        const request: LongCallCacheRequest = {
            role: spec.role,
            model: this.model,
            system: spec.system,
            user: spec.user,
        };
        const cached = await this.fromCache(spec, request);
        if (cached !== null) return cached;

        let weak: T | null = null;
        for (let attempt = 1; attempt <= LONG_CALL_MAX_ATTEMPTS; attempt++) {
            let raw: unknown;
            try {
                raw = await this.send(spec);
            } catch (error) {
                const retry =
                    attempt < LONG_CALL_MAX_ATTEMPTS &&
                    isRetryableLlmError(error);
                this.noteFailure(spec, error, attempt, retry);
                if (retry) continue;
                break;
            }
            const value = spec.parse(raw);
            if (value === null) {
                this.logger.warn(
                    `Длинный разговор (${this.domain}), ${spec.title}: ответ не разобрался (попытка ${attempt})`,
                );
                continue;
            }
            if (spec.isWeak?.(value)) {
                weak = value;
                continue;
            }
            if (isRecord(raw)) await this.cache.set(request, raw);

            return value;
        }

        return weak;
    }

    /** Ответ из кэша; нет записи или запись не разобралась — null. */
    private async fromCache<T>(
        spec: AskSpec<T>,
        request: LongCallCacheRequest,
    ): Promise<T | null> {
        const raw = await this.cache.get(request);
        if (raw === undefined) return null;
        const value = spec.parse(raw);
        if (value === null || spec.isWeak?.(value)) return null;
        this.hits += 1;

        return value;
    }

    /**
     * Один запрос к модели. Тревогу «не ответил никто» шлюз откладывает всегда
     * (и на первой попытке, и на повторе): её шлёт alertAbandoned, одну на разговор.
     */
    private async send<T>(spec: AskSpec<T>): Promise<unknown> {
        this.sent += 1;
        const response = await this.gateway.structuredCompletionWithUsage(
            spec.system,
            spec.user,
            spec.role,
            spec.schema,
            this.domain,
            { model: this.model, deferExhaustedAlert: true },
        );
        this.completions.push(response);

        return response.result;
    }

    /**
     * Сбой запроса: в журнал; ошибку отказа поставщиков запоминаем (только
     * первую) — тревога по ней уйдёт, если длинный путь будет брошен.
     */
    private noteFailure<T>(
        spec: AskSpec<T>,
        error: unknown,
        attempt: number,
        retry: boolean,
    ): void {
        this.logger.warn(
            `Длинный разговор (${this.domain}), ${spec.title}: запрос не удался (попытка ${attempt}${retry ? ', повторим' : ''}): ${describeLlmError(error)}`,
        );
        if (
            this.firstUnavailable === null &&
            error instanceof LlmUnavailableError
        ) {
            this.firstUnavailable = error;
        }
    }
}
