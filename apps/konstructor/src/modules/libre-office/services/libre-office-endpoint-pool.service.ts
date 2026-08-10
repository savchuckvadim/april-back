import { Inject, Injectable, Logger } from '@nestjs/common';
import { Semaphore } from '@lib/shared';
import {
    LIBRE_OFFICE_CONFIG,
    LibreOfficeConfig,
} from '../config/libre-office.config';
import { LibreOfficeBusyError } from '../errors/libre-office.errors';
import { LibreOfficeEndpointResolver } from './libre-office-endpoint-resolver.service';

type PoolSlot = {
    baseUrl: string;
    semaphore: Semaphore;
    /** До этого момента инстанс считается «подбитым» и берётся последним. */
    cooldownUntil: number;
};

export type LibreOfficePoolStats = {
    endpoints: number;
    capacity: number;
    active: number;
    pending: number;
    cooling: number;
};

/**
 * Пул инстансов конвертации: ограничивает параллелизм и сам выбирает,
 * куда отправить документ.
 *
 * Зачем: LibreOffice физически не умеет конвертировать два документа
 * одновременно (один UNO-бэкенд, один профиль пользователя), а Gotenberg
 * держит его под мьютексом. Значит наш параллелизм должен равняться числу
 * инстансов, а всё лишнее — стоять в НАШЕЙ очереди, где мы контролируем и
 * длину, и отказ. Без этого запросы копятся внутри Gotenberg и падают по
 * его --api-timeout, уже потратив время.
 *
 * Состав пула не зафиксирован: в режиме discovery=dns он лениво
 * пересобирается по TTL, поэтому поднятая/убитая реплика подхватывается
 * сама, без рестарта приложения.
 */
@Injectable()
export class LibreOfficeEndpointPool {
    private readonly logger = new Logger(LibreOfficeEndpointPool.name);
    private readonly slots = new Map<string, PoolSlot>();
    private refreshedAt = 0;
    private refreshing: Promise<void> | null = null;

    constructor(
        @Inject(LIBRE_OFFICE_CONFIG) private readonly config: LibreOfficeConfig,
        private readonly resolver: LibreOfficeEndpointResolver,
    ) {
        // Стартовый состав — то, что в env. В dns-режиме он заменится
        // адресами реплик при первой же конвертации, но пул никогда не
        // бывает пустым: имя сервиса и само по себе рабочий endpoint.
        config.endpoints.forEach(baseUrl => this.addSlot(baseUrl));
        this.logger.log(
            `Пул конвертации: ${this.capacity} слот(ов) на ${this.slots.size} инстанс(ах), очередь до ${config.maxQueue}, discovery=${config.discovery}`,
        );
    }

    /** Сколько конверсий может идти одновременно. */
    get capacity(): number {
        return this.slots.size * this.config.slotsPerEndpoint;
    }

    stats(): LibreOfficePoolStats {
        const now = Date.now();
        const all = [...this.slots.values()];
        return {
            endpoints: all.length,
            capacity: this.capacity,
            active: all.reduce((sum, s) => sum + s.semaphore.activeCount, 0),
            pending: all.reduce((sum, s) => sum + s.semaphore.pendingCount, 0),
            cooling: all.filter(s => s.cooldownUntil > now).length,
        };
    }

    /**
     * Выполняет task на наименее загруженном живом инстансе.
     * `avoidBaseUrl` — инстанс, на котором предыдущая попытка уже упала:
     * ретрай уходит на другой, если он есть.
     */
    async run<T>(
        task: (baseUrl: string) => Promise<T>,
        avoidBaseUrl?: string,
    ): Promise<T> {
        await this.ensureFresh();
        const { pending } = this.stats();
        if (pending >= this.config.maxQueue) {
            throw new LibreOfficeBusyError(pending, this.config.maxQueue);
        }
        const slot = this.pickSlot(avoidBaseUrl);
        return slot.semaphore.run(() => task(slot.baseUrl));
    }

    /**
     * Пометить инстанс как подбитый: следующие задачи пойдут на другие,
     * пока не истечёт cooldown. Вызывать только на транзиентных ошибках —
     * битый документ упадёт на любом инстансе, наказывать его не за что.
     */
    penalize(baseUrl: string): void {
        const slot = this.slots.get(baseUrl);
        if (!slot || this.config.failureCooldownMs === 0) {
            return;
        }
        slot.cooldownUntil = Date.now() + this.config.failureCooldownMs;
        this.logger.warn(
            `Инстанс ${baseUrl} отправлен в cooldown на ${this.config.failureCooldownMs} мс`,
        );
    }

    private addSlot(baseUrl: string): void {
        this.slots.set(baseUrl, {
            baseUrl,
            semaphore: new Semaphore(this.config.slotsPerEndpoint),
            cooldownUntil: 0,
        });
    }

    /** Ленивое обновление состава: без таймеров, по TTL и single-flight. */
    private async ensureFresh(): Promise<void> {
        if (this.config.discovery === 'static') {
            return;
        }
        if (Date.now() - this.refreshedAt < this.config.discoveryTtlMs) {
            return;
        }
        if (!this.refreshing) {
            this.refreshing = this.refresh().finally(() => {
                this.refreshing = null;
            });
        }
        await this.refreshing;
    }

    private async refresh(): Promise<void> {
        // Метку ставим до запроса: если DNS недоступен, не долбим его на
        // каждой конвертации.
        this.refreshedAt = Date.now();
        try {
            this.applyDiscovered(await this.resolver.resolve());
        } catch (error) {
            this.logger.warn(
                `Не удалось обновить список инстансов (${(error as Error).message}), оставляю текущие: ${this.slots.size}`,
            );
        }
    }

    private applyDiscovered(discovered: string[]): void {
        if (discovered.length === 0) {
            return;
        }
        const added = discovered.filter(baseUrl => !this.slots.has(baseUrl));
        added.forEach(baseUrl => this.addSlot(baseUrl));

        // Исчезнувшие убираем только простаивающими: занятый слот должен
        // довести свою конвертацию до конца.
        const removed = [...this.slots.values()].filter(
            slot =>
                !discovered.includes(slot.baseUrl) &&
                slot.semaphore.activeCount === 0 &&
                slot.semaphore.pendingCount === 0,
        );
        removed.forEach(slot => this.slots.delete(slot.baseUrl));

        if (added.length > 0 || removed.length > 0) {
            this.logger.log(
                `Состав пула обновлён: +${added.length} / -${removed.length}, итого ${this.slots.size} инстанс(ов), ${this.capacity} слот(ов)`,
            );
        }
    }

    private pickSlot(avoidBaseUrl?: string): PoolSlot {
        const all = [...this.slots.values()];
        const notAvoided =
            all.length > 1 && avoidBaseUrl
                ? all.filter(slot => slot.baseUrl !== avoidBaseUrl)
                : all;
        const candidates = notAvoided.length > 0 ? notAvoided : all;
        // Инстансы в cooldown — только если совсем ничего живого не осталось:
        // отказать из-за подозрения хуже, чем попробовать.
        const now = Date.now();
        const healthy = candidates.filter(slot => slot.cooldownUntil <= now);
        const pool = healthy.length > 0 ? healthy : candidates;
        return pool.reduce((best, slot) =>
            this.load(slot) < this.load(best) ? slot : best,
        );
    }

    private load(slot: PoolSlot): number {
        return slot.semaphore.activeCount + slot.semaphore.pendingCount;
    }
}
