import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { DigestItem, isWorkday } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_PUSH_REASONS } from '../../constants/ai-analytics.const';
import { AiAnalyticsDeliveryService } from '../../delivery/ai-analytics-delivery.service';
import {
    AiAnalyticsPushLogStore,
    digestObject,
} from '../../store/ai-analytics-push-log.store';
import { dayStartUtc } from '../loaders/period.util';
import { SmartLinkLoader } from '../loaders/smart-link.loader';
import { MorningDigestUseCase } from './morning-digest.use-case';
import {
    AiPushResult,
    AiPushRunContext,
    delivered,
    skipped,
} from './push.types';

const KIND = 'digest' as const;

/**
 * Утренний разбор менеджерам (план, Фаза 1a, ежедневно 08:00): каждому
 * менеджеру 1–3 его вчерашних звонка с худшими разделами и фразами
 * «как сказать иначе». Требует ai_analytics_digest_enabled; в выходной
 * не шлётся. Идемпотентность — одна запись digest_sent на
 * домен+менеджер+день. Ручные получатели (тест «отправить себе»)
 * получают дайджесты всех менеджеров, флаг и отметки не применяются.
 */
@Injectable()
export class PushDigestUseCase {
    private readonly logger = new Logger(PushDigestUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly digest: MorningDigestUseCase,
        private readonly smartLinks: SmartLinkLoader,
        private readonly pushLog: AiAnalyticsPushLogStore,
    ) {}

    async run(context: AiPushRunContext): Promise<AiPushResult> {
        const { domain, date, now, settings } = context;
        const manual = context.recipients !== null;
        if (!manual && !settings.digestEnabled) {
            return skipped(
                KIND,
                date,
                AI_ANALYTICS_PUSH_REASONS.DIGEST_DISABLED,
            );
        }
        if (!manual && !isWorkday(date, settings.calendar)) {
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.NOT_WORKDAY);
        }

        const { day, byManager } = await this.digest.execute(domain, { now });
        if (!byManager.size) {
            this.logger.log(
                `Дайджест ${domain} за ${day}: звонков с фразами нет — нечего отправлять`,
            );
            return skipped(KIND, date, AI_ANALYTICS_PUSH_REASONS.EMPTY);
        }

        const links = await this.smartLinks.resolveLinks(
            domain,
            [...byManager.values()].flat().map(item => item.transcriptionId),
        );
        const { bitrix } = await this.pbx.init(domain);
        const delivery = new AiAnalyticsDeliveryService(bitrix);
        const timeZone = settings.calendar.timeZone;
        const since = dayStartUtc(day, timeZone);
        const managerNames = manual
            ? await delivery.resolveUserNames([...byManager.keys()])
            : new Map<string, string>();

        const sentTo: number[] = [];
        for (const [managerId, items] of byManager) {
            const send = (userIds: number[]): Promise<number[]> =>
                delivery.sendDigest(userIds, items, {
                    day,
                    timeZone,
                    managerId,
                    links,
                    managerName: manual
                        ? (managerNames.get(managerId) ?? `#${managerId}`)
                        : null,
                });
            if (manual) {
                sentTo.push(...(await send(context.recipients ?? [])));
                continue;
            }
            const userId = Number(managerId);
            if (!Number.isInteger(userId) || userId <= 0) continue;
            const key = {
                domain,
                kind: 'digest_sent' as const,
                object: digestObject(day),
                managerId,
            };
            if (await this.pushLog.wasSent(key, since)) continue;
            const ok = await send([userId]);
            if (!ok.length) continue;
            sentTo.push(...ok);
            await this.pushLog.markSent({
                ...key,
                payload: { transcriptionIds: this.ids(items) },
            });
        }
        this.logger.log(
            `Дайджест ${domain} за ${day}: менеджеров ${byManager.size}, ` +
                `доставлено ${sentTo.length}` +
                (manual ? ' (ручная отправка)' : ''),
        );
        return delivered(KIND, date, [...new Set(sentTo)]);
    }

    private ids(items: DigestItem[]): string[] {
        return items.map(item => item.transcriptionId);
    }
}
