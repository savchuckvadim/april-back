import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';

/** Что о звонке нужно строке отзыва: кто менеджер и когда звонок. */
export interface CallReviewCallHead {
    userId: string | null;
    userName: string | null;
    callStartedAt: Date | null;
}

/** Номер расшифровки — десятичное целое: остальное в BigInt не превращаем. */
const NUMERIC_ID = /^\d{1,18}$/;

/**
 * Строки расшифровок для страницы админ-списка отзывов: менеджер (id и
 * имя, как записаны при расшифровке) и начало звонка. Читается только
 * страница (до 200 номеров) и только нужные колонки — без текстов.
 * Только чтение, портал — параметром.
 */
@Injectable()
export class CallReviewsCallsReader {
    constructor(private readonly prisma: PrismaService) {}

    async headsOf(
        domain: string,
        transcriptionIds: readonly string[],
    ): Promise<Map<string, CallReviewCallHead>> {
        const numeric = [...new Set(transcriptionIds)].filter(id =>
            NUMERIC_ID.test(id),
        );
        const heads = new Map<string, CallReviewCallHead>();
        if (numeric.length === 0) return heads;
        const rows = await this.prisma.transcription.findMany({
            where: { domain, id: { in: numeric.map(id => BigInt(id)) } },
            select: {
                id: true,
                user_id: true,
                user_name: true,
                call_started_at: true,
            },
        });
        for (const row of rows) {
            heads.set(row.id.toString(), {
                userId: row.user_id,
                userName: row.user_name,
                callStartedAt: row.call_started_at,
            });
        }
        return heads;
    }
}
