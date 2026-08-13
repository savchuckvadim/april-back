import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { BitrixService } from '@/modules/bitrix';
import { getErrorDetails } from '@/shared';

/** id сотрудника → отображаемое имя («Вадим Савчук»). */
export type UserNameMap = Record<number, string>;

const CACHE_APP = 'lead-request';
const CACHE_KEY = 'user-names';
/** Состав отдела меняется редко; час — компромисс цена/свежесть. */
const CACHE_TTL_SEC = 3600;

type BxRow = Record<string, unknown>;

/**
 * Имена сотрудников для читаемых записей истории и уведомлений.
 *
 * Без него в историю заявки уходят голые id («⚠ Сотрудник 447 сам передал
 * заявку → 465»), и руководителю приходится сопоставлять числа с людьми.
 *
 * Кэш на домен (час): состав ОП меняется редко, а история пишется на
 * каждое назначение. Портал недоступен — пустая карта: вызывающий
 * подставит id, запись всё равно появится.
 */
@Injectable()
export class UserNameResolver {
    private readonly logger = new Logger(UserNameResolver.name);

    constructor(private readonly appCache: AppCacheService) {}

    async resolve(
        domain: string,
        bitrix: BitrixService,
        userIds: number[],
    ): Promise<UserNameMap> {
        const unique = [...new Set(userIds.filter(id => id > 0))];
        if (!unique.length) return {};

        const cached = await this.appCache
            .get<UserNameMap>({ app: CACHE_APP, domain, key: CACHE_KEY })
            .catch(() => null);
        const known = cached ?? {};
        const missing = unique.filter(id => !known[id]);
        if (!missing.length) return known;

        try {
            const fetched = await this.fetch(bitrix, missing);
            const merged = { ...known, ...fetched };
            await this.appCache.set({
                app: CACHE_APP,
                domain,
                key: CACHE_KEY,
                group: 'user-names',
                ttlSeconds: CACHE_TTL_SEC,
                data: merged,
            });
            return merged;
        } catch (error) {
            const { message } = getErrorDetails(error);
            this.logger.debug(`имена сотрудников недоступны (${message})`);
            return known;
        }
    }

    /** Одним batch'ем: user.get по каждому id (пачка — 1 HTTP). */
    private async fetch(
        bitrix: BitrixService,
        userIds: number[],
    ): Promise<UserNameMap> {
        for (const id of userIds) {
            bitrix.batch.user.get(`un_${id}`, { ID: id } as never);
        }
        const chunks = await bitrix.api.callBatchWithConcurrency(1);

        const names: UserNameMap = {};
        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                const match = /^un_(\d+)$/.exec(cmd);
                if (!match) continue;
                const row = Array.isArray(value)
                    ? (value[0] as BxRow | undefined)
                    : (value as BxRow | undefined);
                const display = this.displayName(row);
                if (display) names[Number(match[1])] = display;
            }
        }
        return names;
    }

    /** «Имя Фамилия»; ничего не пришло — null (подставим id). */
    private displayName(row: BxRow | undefined): string | null {
        if (!row) return null;
        const parts = [row.NAME, row.LAST_NAME]
            .map(part => (typeof part === 'string' ? part.trim() : ''))
            .filter(Boolean);
        if (parts.length) return parts.join(' ');
        const login = typeof row.LOGIN === 'string' ? row.LOGIN.trim() : '';
        return login || null;
    }
}
