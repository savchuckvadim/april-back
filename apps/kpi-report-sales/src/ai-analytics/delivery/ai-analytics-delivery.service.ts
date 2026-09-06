import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { DigestItem } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_NOTIFY_TAG_PREFIX } from '../constants/ai-analytics.const';
import { AiAgendaDto } from '../dto/ai-agenda.dto';
import {
    buildAgendaMessage,
    buildDigestMessage,
} from './ai-analytics-message.util';

export interface DigestDeliveryContext {
    /** День разбора (YYYY-MM-DD, TZ портала) — в заголовке и TAG. */
    day: string;
    timeZone: string;
    /** Чей разбор — для TAG и подписи при отправке «себе». */
    managerId: string;
    /** transcriptionId → ссылка на карточку разбора. */
    links: ReadonlyMap<string, string | null>;
    /** Подпись менеджера в тексте (только ручная отправка другим адресатам). */
    managerName?: string | null;
}

/**
 * Доставка push-контура AI-аналитики в Bitrix: персональные уведомления
 * (im.notify.system.add) РОПам — повестка, менеджерам — утренний разбор.
 * Одна ответственность — транспорт; тексты — ai-analytics-message.util.
 *
 * НЕ @Injectable: экземпляр Битрикса приходит в конструктор на каждый
 * прогон (new AiAnalyticsDeliveryService(bitrix)) — по правилу домена
 * инстанс Bitrix не хранится в Injectable-сервисах (race condition).
 */
export class AiAnalyticsDeliveryService {
    private readonly logger = new Logger(AiAnalyticsDeliveryService.name);

    constructor(private readonly bitrix: BitrixService) {}

    /**
     * Повестка недели каждому РОПу. Имена менеджеров читаются один раз
     * (fail-open «#id»). Возвращает тех, кому уведомление ушло: сбой по
     * одному получателю не мешает остальным.
     */
    async sendAgenda(
        userIds: number[],
        agenda: AiAgendaDto,
    ): Promise<number[]> {
        const managerIds = new Set<string>();
        for (const item of agenda.items) {
            if (item.managerId) managerIds.add(item.managerId);
        }
        for (const record of agenda.disagreements) {
            if (record.managerId) managerIds.add(record.managerId);
        }
        const message = buildAgendaMessage({
            weekKey: agenda.weekKey,
            items: agenda.items,
            disagreements: agenda.disagreements,
            managerNames: await this.resolveUserNames([...managerIds]),
        });
        return this.notify(
            userIds,
            message,
            `${AI_ANALYTICS_NOTIFY_TAG_PREFIX}:agenda:${agenda.weekKey}`,
        );
    }

    /**
     * Утренний разбор одного менеджера получателям (обычно — ему самому;
     * при ручной отправке «себе» — тестировщику). Возвращает доставленных.
     */
    async sendDigest(
        userIds: number[],
        items: DigestItem[],
        context: DigestDeliveryContext,
    ): Promise<number[]> {
        const message = buildDigestMessage({
            day: context.day,
            timeZone: context.timeZone,
            items,
            links: context.links,
            managerName: context.managerName ?? null,
        });
        return this.notify(
            userIds,
            message,
            `${AI_ANALYTICS_NOTIFY_TAG_PREFIX}:digest:${context.day}:${context.managerId}`,
        );
    }

    /** «Фамилия Имя» по bitrix-id; ошибка/пусто — id в карту не попадает. */
    async resolveUserNames(
        userIds: readonly string[],
    ): Promise<Map<string, string>> {
        const names = new Map<string, string>();
        for (const userId of userIds) {
            try {
                const response = await this.bitrix.user.get({ ID: userId });
                const user = response?.result?.[0];
                const name = [user?.LAST_NAME, user?.NAME]
                    .filter((part): part is string => Boolean(part?.trim()))
                    .join(' ');
                if (name) names.set(userId, name);
            } catch (error) {
                this.logger.warn(
                    `Имя пользователя ${userId} не прочитано: ${(error as Error).message}`,
                );
            }
        }
        return names;
    }

    private async notify(
        userIds: number[],
        message: string,
        tag: string,
    ): Promise<number[]> {
        const delivered: number[] = [];
        for (const userId of userIds) {
            try {
                await this.bitrix.imNotify.systemAdd({
                    USER_ID: userId,
                    MESSAGE: message,
                    TAG: tag,
                });
                delivered.push(userId);
            } catch (error) {
                this.logger.warn(
                    `Уведомление ${tag} не доставлено пользователю ${userId}: ${(error as Error).message}`,
                );
            }
        }
        return delivered;
    }
}
