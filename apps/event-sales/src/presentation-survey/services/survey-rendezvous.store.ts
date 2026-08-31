import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';

/**
 * Кэшируемые значения анкеты для rendezvous с unplanned-сделкой.
 *
 * Исторически ехали только сводные; с 31.08 сделка получает и девять
 * детальных «5К» (решение владельца — карточка pres-сделки показывала
 * девять вечно пустых полей, а legacy PHP их заполнял). `fiveK` опционален
 * и в кэше, и в чтении: записи старого формата в Redis читаются как
 * «детальных не было» — деградация без миграции.
 */
export interface SurveySummaryValues {
    xvost?: string;
    fiveKSummary?: string;
    /** Детальные «5К»: код поля → значение (только whitelist ручки). */
    fiveK?: Record<string, string>;
}

/** Ссылка на сущность-цель rendezvous. */
export type RendezvousRef = readonly [
    kind: 'deal' | 'lead' | 'company',
    id: number,
];

/** Найденный ожидающий сигнал + ключи, под которыми он лежал. */
export interface FoundPendingSignal {
    unplannedDealId: number;
    keys: string[];
}

/** Значения ждут сигнала час: hook-очередь обычно догоняет за секунды. */
const RENDEZVOUS_TTL_SECONDS = 3600;

/** «Запись в unplanned выполнена» — сутки, как дедуп операций. */
const SIGNAL_DONE_TTL_SECONDS = 24 * 3600;

/**
 * Redis-rendezvous опросника и hook-сигнала об unplanned-презентации.
 *
 * Обе стороны приходят независимо и в любом порядке:
 *  - опросник кладёт СВОДНЫЕ значения под ключи всех своих целей
 *    (`survey:values:{domain}:{kind}:{id}`) и проверяет ожидающие сигналы;
 *  - сигнал ищет значения по своим ссылкам, а не найдя — оставляет
 *    ожидание (`survey:pending-signal:...`).
 * Ключ «свершилось» (`survey:signal-done:{domain}:{unplannedDealId}`)
 * общий: кто бы ни завершил rendezvous, второй записи не будет.
 *
 * ДЕГРАДАЦИЯ: любая ошибка Redis глотается с warning — основная запись
 * опросника не страдает, rendezvous в этом случае просто не срабатывает.
 */
@Injectable()
export class SurveyRendezvousStore {
    private readonly logger = new Logger(SurveyRendezvousStore.name);

    constructor(private readonly redis: RedisService) {}

    /** Кладёт сводные значения под ключи всех целей опросника. */
    async cacheValues(
        domain: string,
        refs: readonly RendezvousRef[],
        values: SurveySummaryValues,
    ): Promise<void> {
        const payload = JSON.stringify(values);
        for (const [kind, id] of refs) {
            try {
                await this.redis
                    .getClient()
                    .set(
                        this.valuesKey(domain, kind, id),
                        payload,
                        'EX',
                        RENDEZVOUS_TTL_SECONDS,
                    );
            } catch (error) {
                this.warnOnce('cacheValues', error);
                return;
            }
        }
    }

    /** Первое совпадение значений по ссылкам сигнала (порядок важен). */
    async findValues(
        domain: string,
        refs: readonly RendezvousRef[],
    ): Promise<SurveySummaryValues | null> {
        for (const [kind, id] of refs) {
            try {
                const raw = await this.redis
                    .getClient()
                    .get(this.valuesKey(domain, kind, id));
                if (!raw) continue;
                return JSON.parse(raw) as SurveySummaryValues;
            } catch (error) {
                this.warnOnce('findValues', error);
                return null;
            }
        }
        return null;
    }

    /** Сохраняет ожидающий сигнал под всеми его ссылками. true — сохранён. */
    async storePending(
        domain: string,
        refs: readonly RendezvousRef[],
        unplannedDealId: number,
    ): Promise<boolean> {
        const payload = JSON.stringify({ unplannedDealId, domain });
        let stored = false;
        for (const [kind, id] of refs) {
            try {
                await this.redis
                    .getClient()
                    .set(
                        this.pendingKey(domain, kind, id),
                        payload,
                        'EX',
                        RENDEZVOUS_TTL_SECONDS,
                    );
                stored = true;
            } catch (error) {
                this.warnOnce('storePending', error);
                return stored;
            }
        }
        return stored;
    }

    /** Ожидающие сигналы по целям опросника (уникальные unplanned-сделки). */
    async findPending(
        domain: string,
        refs: readonly RendezvousRef[],
    ): Promise<FoundPendingSignal[]> {
        const byDeal = new Map<number, FoundPendingSignal>();
        for (const [kind, id] of refs) {
            const key = this.pendingKey(domain, kind, id);
            try {
                const raw = await this.redis.getClient().get(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw) as { unplannedDealId?: number };
                const unplannedDealId = Number(parsed?.unplannedDealId);
                if (!Number.isFinite(unplannedDealId) || unplannedDealId <= 0) {
                    continue;
                }
                const found = byDeal.get(unplannedDealId) ?? {
                    unplannedDealId,
                    keys: [],
                };
                found.keys.push(key);
                byDeal.set(unplannedDealId, found);
            } catch (error) {
                this.warnOnce('findPending', error);
                return [...byDeal.values()];
            }
        }
        return [...byDeal.values()];
    }

    /** Удаляет отработанные pending-ключи (остальные истекут по TTL). */
    async deleteKeys(keys: readonly string[]): Promise<void> {
        for (const key of keys) {
            try {
                await this.redis.getClient().del(key);
            } catch (error) {
                this.warnOnce('deleteKeys', error);
                return;
            }
        }
    }

    /**
     * Захват права записи в unplanned-сделку. true — мы первые; false —
     * запись уже была (или выполняется другой стороной).
     * Redis недоступен → true: лучше рискнуть перезаписью тех же сводных
     * (идемпотентно), чем потерять запись.
     */
    async tryMarkDone(
        domain: string,
        unplannedDealId: number,
    ): Promise<boolean> {
        try {
            const stored = await this.redis
                .getClient()
                .set(
                    this.doneKey(domain, unplannedDealId),
                    '1',
                    'EX',
                    SIGNAL_DONE_TTL_SECONDS,
                    'NX',
                );
            return stored !== null;
        } catch (error) {
            this.warnOnce('tryMarkDone', error);
            return true;
        }
    }

    /** Возврат права записи: rendezvous не состоялся, запись не выполнена. */
    async releaseDone(domain: string, unplannedDealId: number): Promise<void> {
        try {
            await this.redis
                .getClient()
                .del(this.doneKey(domain, unplannedDealId));
        } catch (error) {
            this.warnOnce('releaseDone', error);
        }
    }

    /* ------------------------------------------------------------------ */

    private valuesKey(
        domain: string,
        kind: RendezvousRef[0],
        id: number,
    ): string {
        return `survey:values:${domain}:${kind}:${id}`;
    }

    private pendingKey(
        domain: string,
        kind: RendezvousRef[0],
        id: number,
    ): string {
        return `survey:pending-signal:${domain}:${kind}:${id}`;
    }

    private doneKey(domain: string, unplannedDealId: number): string {
        return `survey:signal-done:${domain}:${unplannedDealId}`;
    }

    private warnOnce(operation: string, error: unknown): void {
        this.logger.warn(
            `[survey] Redis-rendezvous (${operation}) недоступен: ${String(error)} — деградация без rendezvous`,
        );
    }
}
