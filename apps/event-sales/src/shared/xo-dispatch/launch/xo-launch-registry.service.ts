import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    XoLaunch,
    XoLaunchDone,
    XoLaunchRef,
    XoLaunchRegistry,
} from './xo-launch.rule';

/**
 * Сколько живёт отметка «хук принят и ждёт обработки». Штатно её снимает
 * обработчик окна; срок — страховка на случай, если окно потерялось.
 */
export const XO_LAUNCH_PENDING_TTL_MS = 3_600_000;

/** Сколько помним завершённый запуск по клиенту. */
export const XO_LAUNCH_DONE_TTL_MS = 6 * 3_600_000;

/**
 * Реестр запусков холодного обзвона в Redis (правило — `xo-launch.rule`).
 *
 *  - `pending` — HASH на карточку запуска: номер запуска → время приёма.
 *    Нужен крону подстраховки: пока хук ждёт в нашей очереди, досылать его
 *    не надо.
 *  - `done` — последний завершённый запуск по КЛИЕНТУ.
 *
 * Сбой Redis здесь не ошибка работы: отметки — подсказки, без них обработка
 * идёт как до правила. Поэтому каждый метод глушит ошибку с предупреждением.
 *
 * Инстанса Битрикса нет — только PBX-независимый Redis (CLAUDE.md).
 */
@Injectable()
export class XoLaunchRegistryService implements XoLaunchRegistry {
    private readonly logger = new Logger(XoLaunchRegistryService.name);

    constructor(private readonly redisService: RedisService) {}

    async markPending(
        domain: string,
        entityKey: string,
        launch: XoLaunch,
    ): Promise<void> {
        const key = this.key(domain, entityKey, 'pending');
        try {
            await this.redisService
                .getClient()
                .multi()
                .hset(key, launch.id, String(launch.acceptedAt))
                .pexpire(key, XO_LAUNCH_PENDING_TTL_MS)
                .exec();
        } catch (error) {
            this.warn('отметка «ждёт обработки» не записана', domain, error);
        }
    }

    async clearPending(
        domain: string,
        refs: readonly XoLaunchRef[],
    ): Promise<void> {
        if (!refs.length) return;
        try {
            const pipeline = this.redisService.getClient().pipeline();
            for (const ref of refs) {
                pipeline.hdel(
                    this.key(domain, ref.entityKey, 'pending'),
                    ref.launchId,
                );
            }
            await pipeline.exec();
        } catch (error) {
            this.warn('отметки «ждёт обработки» не сняты', domain, error);
        }
    }

    async pending(
        domain: string,
        entityKeys: readonly string[],
    ): Promise<ReadonlySet<string> | null> {
        if (!entityKeys.length) return new Set();
        try {
            const pipeline = this.redisService.getClient().pipeline();
            for (const entityKey of entityKeys) {
                pipeline.hlen(this.key(domain, entityKey, 'pending'));
            }
            const replies = (await pipeline.exec()) ?? [];
            const waiting = new Set<string>();
            replies.forEach(([error, count], index) => {
                if (error) throw error;
                if (Number(count) > 0) waiting.add(entityKeys[index]);
            });
            return waiting;
        } catch (error) {
            this.warn('не проверено, что ждёт обработки', domain, error);
            return null;
        }
    }

    async lastDone(
        domain: string,
        clientKeys: readonly string[],
    ): Promise<ReadonlyMap<string, XoLaunchDone>> {
        const done = new Map<string, XoLaunchDone>();
        if (!clientKeys.length) return done;
        try {
            const values = await this.redisService
                .getClient()
                .mget(...clientKeys.map(key => this.key(domain, key, 'done')));
            values.forEach((raw, index) => {
                const parsed = parseDone(raw);
                if (parsed) done.set(clientKeys[index], parsed);
            });
        } catch (error) {
            this.warn('прошлые запуски не прочитаны', domain, error);
        }
        return done;
    }

    async markDone(
        domain: string,
        items: readonly { clientKey: string; launch: XoLaunch }[],
        finishedAt: number,
    ): Promise<void> {
        if (!items.length) return;
        try {
            const pipeline = this.redisService.getClient().pipeline();
            for (const { clientKey, launch } of items) {
                const value: XoLaunchDone = {
                    launchId: launch.id,
                    acceptedAt: launch.acceptedAt,
                    finishedAt,
                };
                pipeline.set(
                    this.key(domain, clientKey, 'done'),
                    JSON.stringify(value),
                    'PX',
                    XO_LAUNCH_DONE_TTL_MS,
                );
            }
            await pipeline.exec();
        } catch (error) {
            this.warn('завершённые запуски не записаны', domain, error);
        }
    }

    private key(
        domain: string,
        entityKey: string,
        kind: 'pending' | 'done',
    ): string {
        return `xo2:launch:${domain}:${entityKey}:${kind}`;
    }

    private warn(what: string, domain: string, error: unknown): void {
        this.logger.warn(
            `[xo-launch] ${domain}: ${what} (${(error as Error).message}) — работаем без этой отметки`,
        );
    }
}

const parseDone = (raw: string | null): XoLaunchDone | null => {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw) as Partial<XoLaunchDone>;
        return typeof value.launchId === 'string' &&
            typeof value.acceptedAt === 'number' &&
            typeof value.finishedAt === 'number'
            ? {
                  launchId: value.launchId,
                  acceptedAt: value.acceptedAt,
                  finishedAt: value.finishedAt,
              }
            : null;
    } catch {
        return null;
    }
};
