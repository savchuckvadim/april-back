import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { AI_ANALYTICS_PUSH_REASONS } from '../../constants/ai-analytics.const';
import { AiAnalyticsDeliveryService } from '../../delivery/ai-analytics-delivery.service';
import {
    agendaObject,
    AiAnalyticsPushLogStore,
} from '../../store/ai-analytics-push-log.store';
import { dayStartUtc, weekMondayOf } from '../loaders/period.util';
import { AgendaUseCase } from './agenda.use-case';
import {
    AiPushResult,
    AiPushRunContext,
    delivered,
    skipped,
} from './push.types';

const KIND = 'agenda' as const;

/**
 * Рассылка повестки планёрки РОПам (план, Фаза 1a, пн 08:30): 3 звонка
 * текущей ISO-недели с причиной, цитатой и ссылкой + несогласия недели.
 * Получатели — ai_analytics_rop_user_ids (или ручные). Идемпотентность —
 * одна запись agenda_sent на домен+неделю (не для ручной отправки).
 */
@Injectable()
export class PushAgendaUseCase {
    private readonly logger = new Logger(PushAgendaUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly agenda: AgendaUseCase,
        private readonly pushLog: AiAnalyticsPushLogStore,
    ) {}

    async run(context: AiPushRunContext): Promise<AiPushResult> {
        const { domain, date, now, settings } = context;
        const manual = context.recipients !== null;
        const recipients = context.recipients ?? settings.ropUserIds;
        if (!recipients.length) {
            this.logger.warn(
                `Повестка ${domain}: РОПы не заданы (ai_analytics_rop_user_ids) — не отправлена`,
            );
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.NO_RECIPIENTS);
        }

        const { weekKey, timeZone } = await this.agenda.resolveWeek(
            domain,
            now,
        );
        const key = {
            domain,
            kind: 'agenda_sent' as const,
            object: agendaObject(weekKey),
            managerId: null,
        };
        if (
            !manual &&
            (await this.pushLog.wasSent(
                key,
                dayStartUtc(weekMondayOf(date), timeZone),
            ))
        ) {
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.ALREADY_SENT);
        }

        const agenda = await this.agenda.execute(domain, { now });
        if (!agenda.items.length) {
            this.logger.log(
                `Повестка ${domain} ${weekKey}: разобранных звонков нет — нечего отправлять`,
            );
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.EMPTY);
        }

        const { bitrix } = await this.pbx.init(domain);
        const sentTo = await new AiAnalyticsDeliveryService(bitrix).sendAgenda(
            recipients,
            agenda,
        );
        if (sentTo.length && !manual) {
            await this.pushLog.markSent({
                ...key,
                payload: {
                    ropUserIds: sentTo,
                    transcriptionIds: agenda.items.map(
                        item => item.transcriptionId,
                    ),
                },
            });
        }
        this.logger.log(
            `Повестка ${domain} ${weekKey}: звонков ${agenda.items.length}, ` +
                `доставлено ${sentTo.length} из ${recipients.length}` +
                (manual ? ' (ручная отправка)' : ''),
        );
        return delivered(KIND, date, sentTo);
    }
}
