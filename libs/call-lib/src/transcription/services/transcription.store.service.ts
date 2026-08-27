import { Injectable, NotFoundException } from '@nestjs/common';
import { Transcription } from 'generated/prisma';
import { TranscriptionRepository } from '../repository/transcription.repository';
import {
    createTranscriptionEntityFromDto,
    createTranscriptionResponseDtoFromPrisma,
} from '../lib/db.mapper';
import {
    TranscriptionBaseDto,
    TranscriptionStoreDto,
} from '../dto/transcription.store.dto';
import {
    TRANSCRIPTION_BUSY_STATUSES,
    TranscriptionPipelineUpdateInput,
    TranscriptionPipelineUpsertInput,
    TranscriptionPipelineView,
} from '../types/transcription-pipeline.types';

@Injectable()
export class TranscriptionStoreService {
    constructor(
        private readonly transcriptionRepository: TranscriptionRepository,
    ) {}

    async create(
        transcriptionDto: TranscriptionBaseDto,
    ): Promise<TranscriptionStoreDto> {
        const transcription =
            await this.transcriptionRepository.create(transcriptionDto);
        if (!transcription) {
            throw new NotFoundException('Transcription not found');
        }
        return createTranscriptionResponseDtoFromPrisma(transcription);
    }

    async updateTranscription(
        id: string,
        transcriptionDto: Partial<TranscriptionBaseDto>,
    ): Promise<TranscriptionStoreDto> {
        const transcription = await this.transcriptionRepository.update(
            id,
            createTranscriptionEntityFromDto(transcriptionDto),
        );
        if (!transcription) {
            throw new NotFoundException('Transcription not found');
        }
        return createTranscriptionResponseDtoFromPrisma(transcription);
    }

    async findById(id: string): Promise<TranscriptionStoreDto> {
        const transcription = await this.transcriptionRepository.findById(id);
        if (!transcription) {
            throw new NotFoundException('Transcription not found');
        }
        return createTranscriptionResponseDtoFromPrisma(transcription);
    }

    /** Строка конвейера по домену и активности — для диагностики звонка. */
    async findPipelineByDedupKey(
        dedupKey: string,
    ): Promise<TranscriptionPipelineView | null> {
        const row = await this.transcriptionRepository.findByDedupKey(dedupKey);
        return row ? this.toPipelineView(row) : null;
    }

    async findAll(): Promise<TranscriptionStoreDto[]> {
        const transcriptions = await this.transcriptionRepository.findMany();
        if (!transcriptions) {
            throw new NotFoundException('Transcriptions not found');
        }
        return transcriptions.map(createTranscriptionResponseDtoFromPrisma);
    }
    async findByDomain(domain: string): Promise<TranscriptionStoreDto[]> {
        const transcriptions =
            await this.transcriptionRepository.findByDomain(domain);
        if (!transcriptions) {
            throw new NotFoundException('Transcriptions not found');
        }
        return transcriptions.map(createTranscriptionResponseDtoFromPrisma);
    }
    async findByDomainAndUser(
        domain: string,
        userId: string,
    ): Promise<TranscriptionStoreDto[]> {
        const transcriptions =
            await this.transcriptionRepository.findByDomainAndUser(
                domain,
                userId,
            );
        if (!transcriptions) {
            throw new NotFoundException('Transcriptions not found');
        }
        return transcriptions.map(createTranscriptionResponseDtoFromPrisma);
    }
    async delete(id: string): Promise<boolean> {
        return await this.transcriptionRepository.delete(id);
    }

    // --- Автоконвейер call-report (dedup_key) ---

    /** Старт обработки звонка конвейером: upsert строки в processing. */
    async startPipeline(
        input: TranscriptionPipelineUpsertInput,
    ): Promise<TranscriptionPipelineView> {
        const row = await this.transcriptionRepository.upsertPipeline(input);
        return this.toPipelineView(row);
    }

    /** Завершение обработки конвейером (done / error / промежуточный provider). */
    async finishPipeline(
        id: string,
        input: TranscriptionPipelineUpdateInput,
    ): Promise<TranscriptionPipelineView> {
        const row = await this.transcriptionRepository.updatePipeline(
            id,
            input,
        );
        return this.toPipelineView(row);
    }

    /**
     * Бронь звонка перед постановкой в очередь. false — звонок уже занят
     * (в очереди, в работе или обработан), ставить повторно не нужно.
     */
    async claimQueued(
        input: TranscriptionPipelineUpsertInput,
    ): Promise<boolean> {
        return this.transcriptionRepository.claimQueued(input);
    }

    /** Снятие брони, если постановка в очередь не удалась. */
    async releaseQueued(dedupKey: string): Promise<boolean> {
        return this.transcriptionRepository.releaseQueued(dedupKey);
    }

    /** Брони старше порога — кандидаты на снятие (джоб проверяет вызывающий). */
    async findStaleQueued(
        olderThan: Date,
    ): Promise<{ id: string; dedupKey: string }[]> {
        return this.transcriptionRepository.findStaleQueued(olderThan);
    }

    /** Пометить строки ошибкой (снятие мёртвых броней). */
    async markPipelineError(ids: string[]): Promise<number> {
        return this.transcriptionRepository.markPipelineError(ids);
    }

    /** Отсев уже занятых (queued/processing/done) ключей — дедуп сканера. */
    async filterBusyDedupKeys(dedupKeys: string[]): Promise<Set<string>> {
        const busy = await this.transcriptionRepository.findBusyDedupKeys(
            dedupKeys,
            TRANSCRIPTION_BUSY_STATUSES,
        );
        return new Set(busy);
    }

    /**
     * История звонков той же CRM-сущности (паспорт звонка глубокого
     * разбора): последние done-строки, новые первыми, без текущей.
     */
    async findRecentByEntity(
        domain: string,
        entityType: string,
        entityId: string,
        excludeId: string | null,
        take = 3,
    ): Promise<TranscriptionPipelineView[]> {
        const rows = await this.transcriptionRepository.findRecentByEntity(
            domain,
            entityType,
            entityId,
            excludeId,
            take,
        );
        return rows.map(row => this.toPipelineView(row));
    }

    /** Зависшие processing старше порога переводит в error (реанимация). */
    async reanimateStaleProcessing(olderThan: Date): Promise<number> {
        return this.transcriptionRepository.reanimateStaleProcessing(olderThan);
    }

    /**
     * Готовые строки автоконвейера (для Agent API), новые первыми.
     * beforeId — keyset-курсор для постраничного обхода назад.
     */
    async findDonePipeline(
        domain: string | undefined,
        take: number,
        beforeId?: string,
    ): Promise<TranscriptionPipelineView[]> {
        const rows = await this.transcriptionRepository.findDonePipeline(
            domain,
            take,
            beforeId,
        );
        return rows.map(row => this.toPipelineView(row));
    }

    /**
     * Готовые строки автоконвейера домена за период (по call_started_at) —
     * сырьё модуля отчётов call-report-analytics.
     */
    async findDoneInPeriod(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<TranscriptionPipelineView[]> {
        const rows =
            await this.transcriptionRepository.findDonePipelineInPeriod(
                domain,
                from,
                to,
            );
        return rows.map(row => this.toPipelineView(row));
    }

    /** Строка по id в pipeline-представлении (с dedup/call-полями). */
    async findPipelineById(id: string): Promise<TranscriptionPipelineView> {
        const row = await this.transcriptionRepository.findById(id);
        if (!row) {
            throw new NotFoundException('Transcription not found');
        }
        return this.toPipelineView(row);
    }

    private toPipelineView(row: Transcription): TranscriptionPipelineView {
        return {
            id: row.id.toString(),
            dedupKey: row.dedup_key,
            domain: row.domain,
            activityId: row.activity_id,
            callId: row.call_id,
            callStartedAt: row.call_started_at,
            provider: row.provider,
            status: row.status,
            text: row.text,
            durationSec: row.duration,
            entityType: row.entity_type,
            entityId: row.entity_id,
            userId: row.user_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
