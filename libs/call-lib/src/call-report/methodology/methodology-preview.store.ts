import { Injectable } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    METHODOLOGY_PREVIEW_TTL_SEC,
    methodologyPreviewKey,
    parseMethodologyPreviewState,
    type MethodologyPreviewState,
} from './methodology-preview.types';

/**
 * Состояние проверки черновика методики в Redis: админка пишет «поставлено»
 * и читает на опросе, воркер event-sales пишет ход и итог. Ключ живёт час.
 */
@Injectable()
export class MethodologyPreviewStore {
    constructor(private readonly redisService: RedisService) {}

    async write(
        state: MethodologyPreviewState,
    ): Promise<MethodologyPreviewState> {
        await this.redisService
            .getClient()
            .set(
                methodologyPreviewKey(state.previewId),
                JSON.stringify(state),
                'EX',
                METHODOLOGY_PREVIEW_TTL_SEC,
            );
        return state;
    }

    /** null — проверки с таким номером нет или срок хранения вышел. */
    async read(previewId: string): Promise<MethodologyPreviewState | null> {
        return parseMethodologyPreviewState(
            await this.redisService
                .getClient()
                .get(methodologyPreviewKey(previewId)),
        );
    }
}
