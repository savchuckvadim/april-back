import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { isWorkday, previousWorkday } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_PUSH_REASONS } from '../../constants/ai-analytics.const';
import { AiAnalyticsDeliveryService } from '../../delivery/ai-analytics-delivery.service';
import { groupDigestAll } from '../../delivery/ai-analytics-digest-all-message.util';
import {
    AiAnalyticsPushLogStore,
    digestAllObject,
} from '../../store/ai-analytics-push-log.store';
import { ManagerOrgLoader } from '../loaders/manager-org.loader';
import { ManagersLoader } from '../loaders/managers.loader';
import { dayStartUtc } from '../loaders/period.util';
import { SmartLinkLoader } from '../loaders/smart-link.loader';
import { MorningDigestUseCase } from './morning-digest.use-case';
import {
    AiPushResult,
    AiPushRunContext,
    delivered,
    skipped,
} from './push.types';

const KIND = 'digest_all' as const;

/**
 * Сводный утренний дайджест (решение владельца 07.09.2026, план §14.5
 * п. 8): адресатам из ai_analytics_digest_all_user_ids — один текст по
 * ВСЕМ менеджерам портала (весь ростер ОП по структуре, по отделам, до 3
 * звонков вчерашнего рабочего дня на менеджера с одной лучшей фразой,
 * итог «кому что»). Идёт в 08:00 тем же кроном, что и личный дайджест,
 * и НЕ зависит от ai_analytics_digest_enabled: достаточно непустого
 * списка адресатов. В выходной не шлётся; пустой день отправляется
 * («Звонков не было») — адресаты видят, что конвейер молчал.
 * Идемпотентность — одна запись digest_sent с object digest_all:{day}
 * (managerId = null) на домен+день. Ручные получатели (тест «отправить
 * себе») получают тот же текст, выходные и отметки не применяются.
 */
@Injectable()
export class PushDigestAllUseCase {
    private readonly logger = new Logger(PushDigestAllUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly digest: MorningDigestUseCase,
        private readonly managers: ManagersLoader,
        private readonly org: ManagerOrgLoader,
        private readonly smartLinks: SmartLinkLoader,
        private readonly pushLog: AiAnalyticsPushLogStore,
    ) {}

    async run(context: AiPushRunContext): Promise<AiPushResult> {
        const { domain, date, now, settings } = context;
        const manual = context.recipients !== null;
        const recipients = context.recipients ?? settings.digestAllUserIds;
        if (!recipients.length) {
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.NO_RECIPIENTS);
        }
        if (!manual && !isWorkday(date, settings.calendar)) {
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.NOT_WORKDAY);
        }

        const timeZone = settings.calendar.timeZone;
        const expectedDay = previousWorkday(date, settings.calendar);
        const key = {
            domain,
            kind: 'digest_sent' as const,
            object: digestAllObject(expectedDay),
            managerId: null,
        };
        if (
            !manual &&
            (await this.pushLog.wasSent(
                key,
                dayStartUtc(expectedDay, timeZone),
            ))
        ) {
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.ALREADY_SENT);
        }

        const { day, byManager } = await this.digest.execute(domain, { now });
        const [roster, org] = await Promise.all([
            this.managers.resolve(domain),
            this.org.load(domain),
        ]);
        const items = [...byManager.values()].flat();
        const links = await this.smartLinks.resolveLinks(
            domain,
            items.map(item => item.transcriptionId),
        );

        const { bitrix } = await this.pbx.init(domain);
        const delivery = new AiAnalyticsDeliveryService(bitrix);
        const managerIds = [
            ...new Set([...roster.map(String), ...byManager.keys()]),
        ];
        const departments = groupDigestAll({
            roster,
            org,
            byManager,
            names: await delivery.resolveUserNames(managerIds),
        });
        const sentTo = await delivery.sendDigestAll(recipients, {
            day,
            timeZone,
            departments,
            links,
        });
        if (sentTo.length && !manual) {
            await this.pushLog.markSent({
                ...key,
                object: digestAllObject(day),
                payload: {
                    recipients: sentTo,
                    managerIds: [...byManager.keys()],
                    transcriptionIds: items.map(item => item.transcriptionId),
                },
            });
        }
        this.logger.log(
            `Сводный дайджест ${domain} за ${day}: менеджеров в ростере ${managerIds.length}, ` +
                `со звонками ${byManager.size}, доставлено ${sentTo.length} из ${recipients.length}` +
                (manual ? ' (ручная отправка)' : ''),
        );
        return delivered(KIND, date, sentTo);
    }
}
