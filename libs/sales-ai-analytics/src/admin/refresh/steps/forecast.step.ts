import { Injectable } from '@nestjs/common';
import { forecastVerdictText } from '../../launch/launch-status.forecast-blocks';
import { AiAnalyticsLaunchStageFlagsService } from '../../launch/services/ai-analytics-launch-stage-flags.service';
import { AiAnalyticsPhase4StatusService } from '../../services/ai-analytics-phase4-status.service';
import type { AiRefreshStepOutcome } from '../refresh.types';
import {
    errorOutcome,
    type AiRefreshStepContext,
    type AiRefreshStepHandler,
} from './refresh-step.types';

/**
 * Прогноз после пересчёта: читается свежая проверка точности; пройдена —
 * показ прогноза включается (как кнопка 6 без force), нет — шаг
 * пропускается с вердиктом словами. Принудительно не включает никогда.
 */
@Injectable()
export class AiRefreshForecastStep implements AiRefreshStepHandler {
    readonly code = 'forecast' as const;

    constructor(
        private readonly phase4: AiAnalyticsPhase4StatusService,
        private readonly stageFlags: AiAnalyticsLaunchStageFlagsService,
    ) {}

    async start({
        scenario,
        now,
    }: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        try {
            const { items } = await this.phase4.forecastBacktest(
                scenario.domain,
                1,
                now,
            );
            const latest = items[0] ?? null;
            if (latest === null || latest.status !== 'pass') {
                return { state: 'skipped', text: forecastVerdictText(latest) };
            }
            const result = await this.stageFlags.apply({
                domain: scenario.domain,
                forecast: true,
            });
            return {
                state: 'done',
                text: `${forecastVerdictText(latest)} ${result.message}`,
            };
        } catch (error) {
            return errorOutcome('Прогноз не проверен', error);
        }
    }

    /** Шаг синхронный, повтор безопасен. */
    probe(context: AiRefreshStepContext): Promise<AiRefreshStepOutcome> {
        return this.start(context);
    }
}
