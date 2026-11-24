import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

/**
 * Сколько живёт отметка события — семь суток, как у досылки отчёта
 * (`DeferredStepDedupStore`): повторная доставка джоба и повторная
 * постановка того же события приходят в пределах минут, запас — на случай
 * долгого простоя воркера.
 */
export const EVENT_DOCUMENT_FLOW_MARK_TTL_SECONDS = 7 * 24 * 3600;

const KEY_PREFIX = 'evdoc:flow';

/**
 * Отметка «событие взято в работу» в Redis.
 *
 * Зачем: счётчики документов считаются как «прочитал + 1». Bull доставляет
 * джоб как минимум один раз — упади воркер после записи, джоб вернётся, и
 * без отметки документ засчитался бы дважды.
 *
 * Отметка ставится ДО выполнения и снимается, только если до записи в
 * Битрикс дело не дошло. Redis недоступен — работаем без отметки: потерять
 * документ хуже, чем рискнуть редким повтором.
 */
@Injectable()
export class EventDocumentFlowStatusService {
    private readonly logger = new Logger(EventDocumentFlowStatusService.name);

    constructor(private readonly redis: RedisService) {}

    /** Занять событие: `false` — оно уже выполнялось или выполняется. */
    async reserve(domain: string, eventId: string): Promise<boolean> {
        try {
            const stored = await this.redis
                .getClient()
                .set(
                    this.key(domain, eventId),
                    '1',
                    'EX',
                    EVENT_DOCUMENT_FLOW_MARK_TTL_SECONDS,
                    'NX',
                );
            return stored !== null;
        } catch (error) {
            this.logger.warn(
                `[document-flow] Redis недоступен (${String(error)}) — событие ` +
                    `${eventId} выполняется без защиты от повтора`,
            );
            return true;
        }
    }

    /** Вернуть событие в работу: до записи не дошло, повтор безопасен. */
    async release(domain: string, eventId: string): Promise<void> {
        try {
            await this.redis.getClient().del(this.key(domain, eventId));
        } catch (error) {
            this.logger.warn(
                `[document-flow] отметка события ${eventId} не снята ` +
                    `(${String(error)}) — повтор до истечения срока будет пропущен`,
            );
        }
    }

    private key(domain: string, eventId: string): string {
        return `${KEY_PREFIX}:${domain}:${eventId}`;
    }
}
