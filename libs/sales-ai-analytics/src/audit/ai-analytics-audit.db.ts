/**
 * Доступ аудита к БД через Prisma (generated/prisma), без Nest: адаптер
 * принимает любой PrismaClient — «голый» из CLI или PrismaService приложения
 * (он наследует PrismaClient). Запросы повторяют выборку отчётов
 * call-report-analytics (transcription.prisma.repository.ts →
 * findDonePipelineInPeriod), чтобы пороги оценивались на той же популяции
 * звонков.
 */
import { PrismaClient } from 'generated/prisma';
import {
    AUDIT_AI_TYPES,
    AuditAiDepth,
    AuditAiRow,
    AuditDb,
    AuditTranscriptionRow,
} from './ai-analytics-audit.load';

/** Статус завершённой транскрипции (как в transcription.prisma.repository.ts). */
const DONE_TRANSCRIPTION_STATUS = 'done';

export class PrismaAuditDb implements AuditDb {
    constructor(private readonly prisma: PrismaClient) {}

    async findDoneTranscriptions(
        domain: string,
        from: Date,
    ): Promise<AuditTranscriptionRow[]> {
        const rows = await this.prisma.transcription.findMany({
            where: {
                domain,
                status: DONE_TRANSCRIPTION_STATUS,
                dedup_key: { not: null },
                OR: [
                    { call_started_at: { gte: from } },
                    { call_started_at: null, created_at: { gte: from } },
                ],
            },
            select: {
                id: true,
                user_id: true,
                duration: true,
                call_started_at: true,
                created_at: true,
            },
            orderBy: { id: 'asc' },
        });
        return rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            duration: row.duration,
            callStartedAt: row.call_started_at,
            createdAt: row.created_at,
        }));
    }

    async findAiRecords(transcriptionIds: bigint[]): Promise<AuditAiRow[]> {
        if (!transcriptionIds.length) return [];
        const rows = await this.prisma.ai.findMany({
            where: {
                transcription_id: { in: transcriptionIds },
                type: { in: [...AUDIT_AI_TYPES] },
            },
            select: {
                id: true,
                transcription_id: true,
                type: true,
                result: true,
                user_result: true,
            },
            orderBy: { id: 'asc' },
        });
        return rows.flatMap(row =>
            row.transcription_id === null || row.type === null
                ? []
                : [
                      {
                          id: row.id,
                          transcriptionId: row.transcription_id,
                          type: row.type,
                          result: row.result,
                          userResult: row.user_result,
                      },
                  ],
        );
    }

    async aiDepth(domain: string, type: string): Promise<AuditAiDepth> {
        const aggregate = await this.prisma.ai.aggregate({
            where: { domain, type },
            _min: { created_at: true },
            _count: { _all: true },
        });
        return {
            type,
            firstCreatedAt: aggregate._min.created_at,
            count: aggregate._count._all,
        };
    }
}
