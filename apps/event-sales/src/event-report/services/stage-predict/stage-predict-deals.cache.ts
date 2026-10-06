import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import { RedisJsonCache } from '@/core/redis/redis-json-cache';
import { IBXDeal } from '@/modules/bitrix';

/**
 * Сколько живут прочитанные сделки клиента для предикта стадии.
 *
 * Фрейм пересчитывает предикт на каждую смену статуса и типа плана — за один
 * разговор это 3–5 вызовов, и каждый читал сделки клиента заново (1–2
 * запроса в Битрикс, разбор нагрузки 05.10.2026). Сами сделки за разговор не
 * меняются: меняются только выбранный статус и план, а они приходят в
 * запросе. Минуты хватает на разговор; после отчёта записи сбрасываются
 * сразу (см. {@link StagePredictDealsCache.invalidate}).
 */
export const STAGE_PREDICT_DEALS_TTL_SEC = 60;

interface PlacementEntry {
    /** Сделка встройки; null — сделки с таким id нет. */
    deal: IBXDeal | null;
}

interface CompanyEntry {
    /** Открытые сделки основной воронки компании. */
    deals: IBXDeal[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isPlacementEntry = (value: unknown): value is PlacementEntry =>
    isRecord(value) && (value.deal === null || isRecord(value.deal));

const isCompanyEntry = (value: unknown): value is CompanyEntry =>
    isRecord(value) &&
    Array.isArray(value.deals) &&
    value.deals.every(isRecord);

const placementKey = (domain: string, dealId: number): string =>
    `event-sales:stage-predict:v1:${domain}:deal:${dealId}`;

const companyKey = (domain: string, companyId: number): string =>
    `event-sales:stage-predict:v1:${domain}:company:${companyId}`;

/**
 * Кэш чтений предикта стадии: сделка встройки и открытые сделки основной
 * воронки компании — двумя записями с точными ключами, чтобы отчёт мог
 * сбросить их без поиска по шаблону.
 *
 * Выбор базовой сделки (сделка встройки → «свои» → первая) в кэш НЕ
 * попадает: он зависит от ответственного из запроса и считается каждый раз.
 *
 * Инстанс Битрикса здесь не живёт — чтение приходит замыканием `load` от
 * вызывающего (CLAUDE.md: `this.bitrix` в `@Injectable` запрещён).
 */
@Injectable()
export class StagePredictDealsCache {
    private readonly placement: RedisJsonCache<PlacementEntry>;
    private readonly company: RedisJsonCache<CompanyEntry>;

    constructor(@Optional() redis?: RedisService) {
        this.placement = new RedisJsonCache<PlacementEntry>(redis, {
            name: 'stage-predict:deal',
            ttlSec: STAGE_PREDICT_DEALS_TTL_SEC,
            guard: isPlacementEntry,
        });
        this.company = new RedisJsonCache<CompanyEntry>(redis, {
            name: 'stage-predict:company',
            ttlSec: STAGE_PREDICT_DEALS_TTL_SEC,
            guard: isCompanyEntry,
        });
    }

    /** Сделка встройки: из кэша либо чтением `load`. */
    async placementDeal(
        domain: string,
        dealId: number,
        load: () => Promise<IBXDeal | null>,
    ): Promise<IBXDeal | null> {
        const entry = await this.placement.getOrLoad(
            placementKey(domain, dealId),
            async () => ({ deal: await load() }),
        );
        return entry?.deal ?? null;
    }

    /** Открытые сделки основной воронки компании: из кэша либо `load`. */
    async companyDeals(
        domain: string,
        companyId: number,
        load: () => Promise<IBXDeal[]>,
    ): Promise<IBXDeal[]> {
        const entry = await this.company.getOrLoad(
            companyKey(domain, companyId),
            async () => ({ deals: await load() }),
        );
        return entry?.deals ?? [];
    }

    /**
     * Отчёт провёл изменения по клиенту — стадии могли сдвинуться, и
     * следующий предикт обязан прочитать сделки заново, а не ждать срока.
     */
    async invalidate(
        domain: string,
        ids: { companyId?: number | null; dealId?: number | null },
    ): Promise<void> {
        const keys: string[] = [];
        if (ids.dealId) keys.push(placementKey(domain, ids.dealId));
        if (ids.companyId) keys.push(companyKey(domain, ids.companyId));
        if (!keys.length) return;
        // Обе записи лежат в одном Redis — сбрасываем одним вызовом.
        await this.placement.del(...keys);
    }
}
