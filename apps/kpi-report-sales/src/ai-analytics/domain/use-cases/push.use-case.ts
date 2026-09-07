import { Injectable } from '@nestjs/common';
import { toPortalDate } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_PUSH_REASONS } from '../../constants/ai-analytics.const';
import { dayNoonUtc } from '../loaders/period.util';
import { SettingsLoader } from '../loaders/settings.loader';
import { PushAgendaUseCase } from './push-agenda.use-case';
import { PushDigestAllUseCase } from './push-digest-all.use-case';
import { PushDigestUseCase } from './push-digest.use-case';
import {
    AiPushInput,
    AiPushResult,
    AiPushRunContext,
    skipped,
} from './push.types';

/**
 * Фасад push-рассылки — один вход для процессора очереди и ручной ручки
 * POST ai-analytics/push: настройки портала → флаг ai_analytics_enabled →
 * день/момент запуска в TZ портала → кейс по виду (повестка / личный
 * дайджест / сводный дайджест).
 */
@Injectable()
export class AiAnalyticsPushUseCase {
    constructor(
        private readonly settings: SettingsLoader,
        private readonly agenda: PushAgendaUseCase,
        private readonly digest: PushDigestUseCase,
        private readonly digestAll: PushDigestAllUseCase,
    ) {}

    async execute(input: AiPushInput): Promise<AiPushResult> {
        const settings = await this.settings.load(input.domain);
        const timeZone = settings.calendar.timeZone;
        const date = input.date ?? toPortalDate(new Date(), timeZone);
        if (!settings.enabled) {
            return skipped(
                input.kind,
                date,
                AI_ANALYTICS_PUSH_REASONS.DISABLED,
            );
        }
        const context: AiPushRunContext = {
            domain: input.domain,
            date,
            now: dayNoonUtc(date, timeZone),
            settings,
            recipients: input.recipients?.length ? input.recipients : null,
        };
        switch (input.kind) {
            case 'agenda':
                return this.agenda.run(context);
            case 'digest':
                return this.digest.run(context);
            case 'digest_all':
                return this.digestAll.run(context);
        }
    }
}
