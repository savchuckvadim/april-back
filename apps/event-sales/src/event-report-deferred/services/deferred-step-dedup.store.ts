import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

/**
 * TTL отметки исполненного шага — СЕМЬ СУТОК.
 *
 * Почему не сутки (как у дедупа опросника презентации): там дедуп — экономия
 * похода в Битрикс, а сама запись идемпотентна (перезапись). Здесь наоборот —
 * повтор шага РЕАЛЬНО дублирует данные: `crm.deal.add` заведёт вторую
 * pres-сделку, недедуплицированные строки KPI лягут второй раз. Единственная
 * защита от повтора — эта отметка, и жить она обязана дольше, чем конверт
 * ждёт своей досылки в закрытой вкладке менеджера (выходные — двое суток,
 * отпуск — больше; семь дней совпадают с предложенным TTL депо конвертов,
 * план А5.7). Ключей мало (≤8 на отчёт), объём — байты.
 */
export const DEFERRED_STEP_DEDUP_TTL_SECONDS = 7 * 24 * 3600;

/** Префикс ключей — свой, чужие дедупы (survey:*) не задеваются. */
const KEY_PREFIX = 'evflow:deferred';

/**
 * Отметка исполненных шагов досылки в Redis: «эта пара (operationId, шаг)
 * уже отработала».
 *
 * Механика — `SET NX EX`, как у дедупа опросника презентации: отметка
 * СТАВИТСЯ ДО исполнения (два одновременных запроса не выполнят шаг дважды)
 * и СНИМАЕТСЯ, если шаг упал — иначе упавший шаг стал бы «уже исполненным»
 * навсегда, и фронт потерял бы право его повторить.
 *
 * Redis недоступен — работаем БЕЗ дедупа: терять хвост отчёта из-за упавшего
 * кэша нельзя, а собственные защиты шагов остаются (KPI-дедуп через
 * `lists.element.get`, jobId сайд-джобов).
 */
@Injectable()
export class DeferredStepDedupStore {
    private readonly logger = new Logger(DeferredStepDedupStore.name);

    constructor(private readonly redis: RedisService) {}

    /**
     * Занять шаг под исполнение.
     * @returns `true` — шаг наш, исполняем; `false` — уже исполнялся.
     */
    async reserve(
        domain: string,
        operationId: string,
        stepKey: string,
    ): Promise<boolean> {
        try {
            const stored = await this.redis
                .getClient()
                .set(
                    this.key(domain, operationId, stepKey),
                    '1',
                    'EX',
                    DEFERRED_STEP_DEDUP_TTL_SECONDS,
                    'NX',
                );
            return stored !== null;
        } catch (error) {
            this.logger.warn(
                `[deferred] Redis-дедуп недоступен (${String(error)}) — ` +
                    `шаг ${stepKey} операции ${operationId} исполняется без дедупа`,
            );
            return true;
        }
    }

    /** Вернуть шаг в работу: исполнение не состоялось, повтор разрешён. */
    async release(
        domain: string,
        operationId: string,
        stepKey: string,
    ): Promise<void> {
        try {
            await this.redis
                .getClient()
                .del(this.key(domain, operationId, stepKey));
        } catch (error) {
            // Не смертельно: отметка протухнет по TTL. Но повтор шага до
            // этого момента будет считаться дублем — об этом надо знать.
            this.logger.warn(
                `[deferred] отметка шага ${stepKey} операции ${operationId} ` +
                    `не снята (${String(error)}) — повтор до истечения TTL ` +
                    'будет отвергнут как дубль',
            );
        }
    }

    /** Домен в ключе: конверты соседних порталов не смешиваются. */
    private key(domain: string, operationId: string, stepKey: string): string {
        return `${KEY_PREFIX}:${domain}:${operationId}:${stepKey}`;
    }
}
