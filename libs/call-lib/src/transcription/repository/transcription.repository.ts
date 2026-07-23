import { Transcription } from 'generated/prisma';
import { TranscriptionBaseDto } from '../dto/transcription.store.dto';
import {
    TranscriptionPipelineUpdateInput,
    TranscriptionPipelineUpsertInput,
} from '../types/transcription-pipeline.types';

export abstract class TranscriptionRepository {
    abstract create(
        transcription: TranscriptionBaseDto,
    ): Promise<Transcription | null>;
    abstract update(
        id: string,
        transcription: Partial<Transcription>,
    ): Promise<Transcription | null>;
    abstract findById(id: string): Promise<Transcription | null>;
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

    /** Реанимация зависших processing: status→error, возвращает число строк. */
    abstract reanimateStaleProcessing(olderThan: Date): Promise<number>;

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
}
