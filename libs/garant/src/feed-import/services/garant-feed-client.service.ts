import { Injectable, Logger } from '@nestjs/common';
import { GarantFeed, parseGarantFeed } from '../types/garant-feed.types';

/**
 * Клиент Google-фида цен (Apps Script легаси-таблицы владельца).
 * URL задаётся переменной окружения GARANT_FEED_URL — фид содержит
 * идентификатор скрипта и в код не зашивается.
 */
@Injectable()
export class GarantFeedClientService {
    private readonly logger = new Logger(GarantFeedClientService.name);

    /** Таймаут запроса к Apps Script (редирект + генерация до ~20 сек) */
    private static readonly FETCH_TIMEOUT_MS = 60_000;

    getFeedUrl(): string | null {
        const url = process.env.GARANT_FEED_URL;
        return url && url.length > 0 ? url : null;
    }

    async fetchFeed(): Promise<GarantFeed> {
        const url = this.getFeedUrl();
        if (!url) {
            throw new Error(
                'GARANT_FEED_URL не задан — укажите адрес Google-фида цен в окружении',
            );
        }
        this.logger.log('Загружаю Google-фид цен…');
        const response = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(
                GarantFeedClientService.FETCH_TIMEOUT_MS,
            ),
        });
        if (!response.ok) {
            throw new Error(
                `Google-фид ответил статусом ${response.status} ${response.statusText}`,
            );
        }
        const raw: unknown = await response.json();
        const feed = parseGarantFeed(raw);
        this.logger.log(
            `Фид получен: prof=${feed.prices.prof.length}, lt=${feed.prices.lt.length}, ` +
                `star=${feed.prices.star.length}, regions=${feed.regions.length}`,
        );
        return feed;
    }
}
