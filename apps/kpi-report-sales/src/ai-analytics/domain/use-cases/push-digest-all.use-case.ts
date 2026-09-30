import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    DigestItem,
    isWorkday,
    previousWorkday,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_PUSH_REASONS } from '../../constants/ai-analytics.const';
import { AiAnalyticsDeliveryService } from '../../delivery/ai-analytics-delivery.service';
import { groupDigestAll } from '../../delivery/ai-analytics-digest-all-message.util';
import {
    AiAnalyticsPushLogStore,
    type AiAnalyticsPushSentKey,
    digestAllObject,
} from '../../store/ai-analytics-push-log.store';
import { AiManagerScopeResolver } from '../access/ai-manager-scope.resolver';
import { ManagerOrgLoader } from '../loaders/manager-org.loader';
import { dayStartUtc } from '../loaders/period.util';
import { SmartLinkLoader } from '../loaders/smart-link.loader';
import { UserNamesReader } from '../loaders/user-names.reader';
import { MorningDigestUseCase } from './morning-digest.use-case';
import {
    AiPushResult,
    AiPushRunContext,
    delivered,
    skipped,
} from './push.types';

const KIND = 'digest_all' as const;

/** Что ушло адресатам: для отметки digest_sent и её payload. */
interface DigestAllSent {
    domain: string;
    day: string;
    recipients: number[];
    byManager: ReadonlyMap<string, readonly DigestItem[]>;
}

/**
 * Сводный утренний дайджест (решение владельца 07.09.2026, план §14.5
 * п. 8): адресатам из ai_analytics_digest_all_user_ids — один текст по
 * сотрудникам вкладки AI (периметр без фильтра, AiManagerScopeResolver:
 * список разбора звонков, а без него — весь ростер ОП; по отделам, до 3
 * звонков вчерашнего рабочего дня на менеджера с одной лучшей фразой,
 * итог «кому что»). «Звонков не было» перечисляет только сотрудников из
 * разбора, а не весь отдел. Идёт в 08:00 тем же кроном, что и личный
 * дайджест, и НЕ зависит от ai_analytics_digest_enabled: достаточно
 * непустого списка адресатов. В выходной не шлётся; пустой день
 * отправляется («Звонков не было») — адресаты видят, что конвейер молчал.
 * Идемпотентность — одна запись digest_sent с object digest_all:{day}
 * (managerId = null) на домен+день; сбой записи отметки после доставки
 * не превращает доставку в ошибку. Ручные получатели (тест «отправить
 * себе») получают тот же текст, выходные и отметки не применяются.
 */
@Injectable()
export class PushDigestAllUseCase {
    private readonly logger = new Logger(PushDigestAllUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly digest: MorningDigestUseCase,
        private readonly scopes: AiManagerScopeResolver,
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
        if (
            !manual &&
            (await this.pushLog.wasSent(
                this.sentKey(domain, expectedDay),
                dayStartUtc(expectedDay, timeZone),
            ))
        ) {
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.ALREADY_SENT);
        }

        const { day, byManager } = await this.digest.execute(domain, { now });
        const [scope, org] = await Promise.all([
            this.scopes.resolveFor(domain, undefined, settings.callReport),
            this.org.load(domain),
        ]);
        const roster = scope.managerIds;
        const items = [...byManager.values()].flat();
        const links = await this.smartLinks.resolveLinks(
            domain,
            items.map(item => item.transcriptionId),
        );

        const { bitrix } = await this.pbx.init(domain);
        const managerIds = [
            ...new Set([...roster.map(String), ...byManager.keys()]),
        ];
        const departments = groupDigestAll({
            roster,
            org,
            byManager,
            names: await new UserNamesReader(bitrix).read(managerIds),
        });
        const sentTo = await new AiAnalyticsDeliveryService(
            bitrix,
        ).sendDigestAll(recipients, { day, timeZone, departments, links });
        if (sentTo.length && !manual) {
            await this.markSent({ domain, day, recipients: sentTo, byManager });
        }
        this.logger.log(
            `Сводный дайджест ${domain} за ${day}: сотрудников вкладки ${managerIds.length}` +
                (scope.pilotActive ? ' (список разбора)' : '') +
                `, со звонками ${byManager.size}, доставлено ${sentTo.length} из ${recipients.length}` +
                (manual ? ' (ручная отправка)' : ''),
        );
        return delivered(KIND, date, sentTo);
    }

    /** Адрес отметки «отправлено» за день разбора (managerId = null). */
    private sentKey(domain: string, day: string): AiAnalyticsPushSentKey {
        return {
            domain,
            kind: 'digest_sent',
            object: digestAllObject(day),
            managerId: null,
        };
    }

    /**
     * Отметка digest_sent после доставки. Уведомления уже у адресатов,
     * поэтому сбой записи (например, ais недоступна) — не провал рассылки:
     * error-лог с оповещением в Telegram, а результат — фактическая
     * доставка. Без отметки повторный запуск за этот день отправит
     * дайджест ещё раз — об этом и говорит оповещение.
     */
    private async markSent(sent: DigestAllSent): Promise<void> {
        const items = [...sent.byManager.values()].flat();
        try {
            await this.pushLog.markSent({
                ...this.sentKey(sent.domain, sent.day),
                payload: {
                    recipients: sent.recipients,
                    managerIds: [...sent.byManager.keys()],
                    transcriptionIds: items.map(item => item.transcriptionId),
                },
            });
        } catch (error) {
            this.logger.error(
                `Сводный дайджест ${sent.domain} за ${sent.day} доставлен ` +
                    `(${sent.recipients.join(', ')}), но отметка об отправке не ` +
                    `записана: ${(error as Error).message}. Повторный запуск за ` +
                    'этот день отправит его снова',
                { telegram: true, domain: sent.domain },
            );
        }
    }
}
