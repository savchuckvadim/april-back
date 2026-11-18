import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    ANALYSIS_PREVIEW_TTL_SEC,
    analysisPreviewKey,
    parseAnalysisPreviewState,
    type AnalysisPreviewState,
} from './analysis-preview.types';

/**
 * Состояние проверки разбора на звонке в Redis: админка пишет «поставлено»
 * и читает на опросе, воркер event-sales пишет ход и итог. Ключ живёт час.
 */
@Injectable()
export class AnalysisPreviewStore {
    constructor(private readonly redisService: RedisService) {}

    async write(state: AnalysisPreviewState): Promise<AnalysisPreviewState> {
        await this.redisService
            .getClient()
            .set(
                analysisPreviewKey(state.previewId),
                JSON.stringify(state),
                'EX',
                ANALYSIS_PREVIEW_TTL_SEC,
            );
        return state;
    }

    /** null — проверки с таким номером нет или срок хранения вышел. */
    async read(previewId: string): Promise<AnalysisPreviewState | null> {
        return parseAnalysisPreviewState(
            await this.redisService
                .getClient()
                .get(analysisPreviewKey(previewId)),
        );
    }
}
