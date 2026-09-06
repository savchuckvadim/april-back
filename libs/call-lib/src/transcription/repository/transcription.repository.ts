import { Prisma, Transcription } from 'generated/prisma';
import { TranscriptionBaseDto } from '../dto/transcription.store.dto';
import {
    TranscriptionPipelineUpdateInput,
    TranscriptionPipelineUpsertInput,
} from '../types/transcription-pipeline.types';

/**
 * Колонки лёгкой выборки done-строк (без text и прочих LongText) — для
 * отчётов и AI-аналитики, где текст транскрипта не нужен.
 */
export const TRANSCRIPTION_PIPELINE_LITE_SELECT = {
    id: true,
    domain: true,
    call_started_at: true,
    duration: true,
    entity_type: true,
    entity_id: true,
    user_id: true,
    created_at: true,
} as const satisfies Prisma.TranscriptionSelect;

/** Строка лёгкой выборки — только колонки TRANSCRIPTION_PIPELINE_LITE_SELECT. */
export type TranscriptionPipelineLiteRow = Pick<
    Transcription,
    keyof typeof TRANSCRIPTION_PIPELINE_LITE_SELECT
>;

export abstract class TranscriptionRepository {
    abstract create(
        transcription: TranscriptionBaseDto,
    ): Promise<Transcription | null>;
    abstract update(
        id: string,
        transcription: Partial<Transcription>,
    ): Promise<Transcription | null>;
    abstract findById(id: string): Promise<Transcription | null>;
    /** Строка конвейера по ключу дедупа «domain:activityId» (диагностика). */
    abstract findByDedupKey(dedupKey: string): Promise<Transcription | null>;
    abstract findMany(): Promise<Transcription[] | null>;
    abstract findByDomain(domain: string): Promise<Transcription[] | null>;
    abstract findByDomainAndUser(
        domain: string,
        userId: string,
    ): Promise<Transcription[] | null>;
    abstract delete(id: string): Promise<boolean>;

    // --- Автоконвейер call-report (dedup_key) ---

    /** Upsert по dedup_key: новая строка или возврат упавшей в processing. */
    abstract upsertPipeline(
        input: TranscriptionPipelineUpsertInput,
    ): Promise<Transcription>;

    /** Обновление результата обработки конвейером по id строки. */
    abstract updatePipeline(
        id: string,
        input: TranscriptionPipelineUpdateInput,
    ): Promise<Transcription>;

    /** Какие из dedup-ключей уже заняты (status в списке). */
    abstract findBusyDedupKeys(
        dedupKeys: string[],
        statuses: string[],
    ): Promise<string[]>;

    /**
     * Бронь звонка сканером ДО постановки в очередь: строка со статусом
     * 'queued'. true — забронировали мы, false — звонок уже занят кем-то
     * (queued/processing/done) и ставить его повторно не нужно.
     */
    abstract claimQueued(
        input: TranscriptionPipelineUpsertInput,
    ): Promise<boolean>;

    /** Снятие брони (постановка в очередь не удалась): queued → error. */
    abstract releaseQueued(dedupKey: string): Promise<boolean>;

    /** Реанимация зависших processing: status→error, возвращает число строк. */
    abstract reanimateStaleProcessing(olderThan: Date): Promise<number>;

    /**
     * Брони, висящие дольше порога: кандидаты на реанимацию. Решение
     * принимает вызывающий — только он знает, жив ли ещё джоб в очереди.
     */
    abstract findStaleQueued(
        olderThan: Date,
    ): Promise<{ id: string; dedupKey: string }[]>;

    /** Перевод перечисленных строк в error (снятие мёртвых броней). */
    abstract markPipelineError(ids: string[]): Promise<number>;

    /**
     * Готовые (done) строки автоконвейера для Agent API, новые первыми.
     * beforeId — keyset-курсор (id < beforeId) для постраничного обхода.
     */
    abstract findDonePipeline(
        domain: string | undefined,
        take: number,
        beforeId?: string,
    ): Promise<Transcription[]>;

    /**
     * Готовые (done) строки автоконвейера домена за период по времени
     * звонка (call_started_at ∈ [from, to]) — сырьё модуля отчётов
     * call-report-analytics. Прочие фильтры (менеджер, длительность,
     * тип звонка) применяются выше по строкам и ais-записям.
     */
    abstract findDonePipelineInPeriod(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<Transcription[]>;

    /**
     * История звонков той же CRM-сущности (паспорт звонка глубокого
     * разбора): последние done-строки, новые первыми, без excludeId.
     */
    abstract findRecentByEntity(
        domain: string,
        entityType: string,
        entityId: string,
        excludeId: string | null,
        take: number,
    ): Promise<Transcription[]>;

    /**
     * То же, что findDonePipelineInPeriod, но select только колонок
     * TRANSCRIPTION_PIPELINE_LITE_SELECT (без текста транскрипта) — для
     * лёгкой выборки AI-аналитики.
     */
    abstract findDonePipelineInPeriodLite(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<TranscriptionPipelineLiteRow[]>;
}
