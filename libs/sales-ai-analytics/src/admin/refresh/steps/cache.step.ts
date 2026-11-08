import { Injectable } from '@nestjs/common';
import { AiAnalyticsLaunchCacheService } from '../../launch/services/ai-analytics-launch-cache.service';
import type { AiRefreshStepOutcome } from '../refresh.types';
import {
    errorOutcome,
    type AiRefreshStepContext,
    type AiRefreshStepHandler,
} from './refresh-step.types';

/** Сброс кэша витрины портала — сразу, без ожидания. */
@Injectable()
export class AiRefreshCacheStep implements AiRefreshStepHandler {
    readonly code = 'cache' as const;

    constructor(private readonly cache: AiAnalyticsLaunchCacheService) {}

    async start({
        scenario,
    }: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        try {
            const result = await this.cache.reset(scenario.domain, 'all');
            return { state: 'done', text: result.message };
        } catch (error) {
            return errorOutcome('Кэш витрины не сброшен', error);
        }
    }

    /** Шаг синхронный: до проверки дело не доходит, повтор — тот же сброс. */
    probe(context: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        return this.start(context);
    }
}
