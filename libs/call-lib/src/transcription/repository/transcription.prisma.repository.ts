import { Injectable } from '@nestjs/common';
import { TranscriptionRepository } from './transcription.repository';
import { PrismaService } from '@lib/core';
import { Prisma, Transcription } from 'generated/prisma';
import { TranscriptionBaseDto } from '../dto/transcription.store.dto';
import {
    TranscriptionPipelineUpdateInput,
    TranscriptionPipelineUpsertInput,
} from '../types/transcription-pipeline.types';

@Injectable()
export class TranscriptionPrismaRepository implements TranscriptionRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(
        transcription: TranscriptionBaseDto,
    ): Promise<Transcription | null> {
        return this.prisma.transcription.create({
            data: {
                user_name: transcription.userName,
                app: transcription.app,
                activity_id: transcription.activityId,
                file_id: transcription.fileId,
                in_comment: transcription.inComment,
                status: transcription.status,
                text: transcription.text,
                symbols_count: transcription.symbolsCount,
                price: transcription.price,
                duration: transcription.duration,
                domain: transcription.domain,
                user_id: transcription.userId,
                entity_type: transcription.entityType,
                entity_id: transcription.entityId,
                entity_name: transcription.entityName,
                department: transcription.department,
                user_result: transcription.userResult
                    ? (JSON.parse(
                          transcription.userResult,
                      ) as Prisma.InputJsonValue)
                    : Prisma.DbNull,
                provider: transcription.provider,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
    }
    async update(
        id: string,
        transcription: Partial<Transcription>,
    ): Promise<Transcription | null> {
        return this.prisma.transcription.update({
            where: { id: BigInt(id) },
            data: {
                ...transcription,
                user_result: transcription.user_result
                    ? (JSON.parse(
                          transcription.user_result as string,
                      ) as Prisma.InputJsonValue)
                    : Prisma.DbNull,
                updated_at: new Date(),
            },
        });
    }
    async findById(id: string): Promise<Transcription | null> {
        return this.prisma.transcription.findUnique({
            where: { id: BigInt(id) },
        });
    }
    async findMany(): Promise<Transcription[] | null> {
        return this.prisma.transcription.findMany();
    }
    async findByDomain(domain: string): Promise<Transcription[] | null> {
        return this.prisma.transcription.findMany({
            where: { domain },
        });
    }
    async findByDomainAndUser(
        domain: string,
        userId: string,
    ): Promise<Transcription[] | null> {
        return this.prisma.transcription.findMany({
            where: { domain, user_id: userId },
        });
    }
    async delete(id: string): Promise<boolean> {
        const result = await this.prisma.transcription.delete({
            where: { id: BigInt(id) },
        });
        return result !== null;
    }

    // --- Автоконвейер call-report (dedup_key) ---

    async upsertPipeline(
        input: TranscriptionPipelineUpsertInput,
    ): Promise<Transcription> {
        const now = new Date();
        const base = {
            status: 'processing',
            domain: input.domain,
            activity_id: input.activityId,
            entity_type: input.entityType,
            entity_id: input.entityId,
            app: input.app,
            updated_at: now,
        };
        // Опциональные телефонные метаданные: в update-ветке отсутствующие
        // поля НЕ перезаписываются (ручной перезапуск /call-report/analyze
        // без callId/даты не должен стирать данные voximplant из скана).
        const optional: Record<string, unknown> = {};
        if (input.callId !== undefined) optional.call_id = input.callId;
        if (input.callStartedAt !== undefined) {
            optional.call_started_at = input.callStartedAt;
        }
        if (input.userId !== undefined) optional.user_id = input.userId;
        if (input.durationSec !== undefined) {
            optional.duration = String(input.durationSec);
        }
        return this.prisma.transcription.upsert({
            where: { dedup_key: input.dedupKey },
            create: {
                dedup_key: input.dedupKey,
                created_at: now,
                call_id: input.callId ?? null,
                call_started_at: input.callStartedAt ?? null,
                user_id: input.userId ?? null,
                duration:
                    input.durationSec !== undefined
                        ? String(input.durationSec)
                        : null,
                ...base,
            },
            update: { ...base, ...optional },
        });
    }

    async updatePipeline(
        id: string,
        input: TranscriptionPipelineUpdateInput,
    ): Promise<Transcription> {
        const data: Prisma.TranscriptionUpdateInput = {
            status: input.status,
            updated_at: new Date(),
        };
        if (input.provider !== undefined) data.provider = input.provider;
        if (input.text !== undefined) data.text = input.text;
        if (input.symbolsCount !== undefined) {
            data.symbols_count = input.symbolsCount;
        }
        if (input.durationSec !== undefined) {
            data.duration = String(input.durationSec);
        }
        if (input.userId !== undefined) {
            data.user_id = input.userId;
        }
        return this.prisma.transcription.update({
            where: { id: BigInt(id) },
            data,
        });
    }

    async findBusyDedupKeys(
        dedupKeys: string[],
        statuses: string[],
    ): Promise<string[]> {
        if (!dedupKeys.length) return [];
        const rows = await this.prisma.transcription.findMany({
            where: {
                dedup_key: { in: dedupKeys },
                status: { in: statuses },
            },
            select: { dedup_key: true },
        });
        return rows
            .map(row => row.dedup_key)
            .filter((key): key is string => key !== null);
    }

    async reanimateStaleProcessing(olderThan: Date): Promise<number> {
        const result = await this.prisma.transcription.updateMany({
            where: {
                status: 'processing',
                dedup_key: { not: null },
                updated_at: { lt: olderThan },
            },
            data: { status: 'error', updated_at: new Date() },
        });
        return result.count;
    }

    async findDonePipeline(
        domain: string | undefined,
        take: number,
        beforeId?: string,
    ): Promise<Transcription[]> {
        return this.prisma.transcription.findMany({
            where: {
                status: 'done',
                dedup_key: { not: null },
                ...(domain ? { domain } : {}),
                ...(beforeId ? { id: { lt: BigInt(beforeId) } } : {}),
            },
            orderBy: { id: 'desc' },
            take,
        });
    }

    /**
     * История звонков той же CRM-сущности (для «паспорта звонка» глубокого
     * разбора): последние done-строки, новые первыми, без текущей.
     */
    async findRecentByEntity(
        domain: string,
        entityType: string,
        entityId: string,
        excludeId: string | null,
        take: number,
    ): Promise<Transcription[]> {
        return this.prisma.transcription.findMany({
            where: {
                status: 'done',
                domain,
                entity_type: entityType,
                entity_id: entityId,
                ...(excludeId ? { id: { not: BigInt(excludeId) } } : {}),
            },
            orderBy: { id: 'desc' },
            take,
        });
    }

    async findDonePipelineInPeriod(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<Transcription[]> {
        return this.prisma.transcription.findMany({
            where: {
                status: 'done',
                dedup_key: { not: null },
                domain,
                // Период — по фактическому времени звонка; у части строк
                // call_started_at пуст (ручные POST /call-report/analyze без
                // callStartedAtIso) — для них fallback на created_at, иначе
                // такие звонки навсегда выпадали бы из отчётов.
                OR: [
                    { call_started_at: { gte: from, lte: to } },
                    {
                        call_started_at: null,
                        created_at: { gte: from, lte: to },
                    },
                ],
            },
            orderBy: { call_started_at: 'asc' },
        });
    }
}
