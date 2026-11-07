import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    fallbackRuCalendar,
    parseIsDayOff,
    parseXmlCalendarJson,
} from './ru-work-calendar.parse';
import type { RuWorkCalendarYear } from './ru-work-calendar.types';

/** Источники и тайминги (оба хоста российские — прокси не нужен). */
export const RU_WORK_CALENDAR_SOURCES_URL = {
    xmlcalendar: (year: number) =>
        `https://xmlcalendar.ru/data/ru/${year}/calendar.json`,
    isdayoff: (year: number) =>
        `https://isdayoff.ru/api/getdata?year=${year}&cc=ru`,
} as const;

export const RU_WORK_CALENDAR_TIMEOUT_MS = 5_000;
/** Живой календарь держим месяц, запасной — час: источник мог отлежаться. */
export const RU_WORK_CALENDAR_TTL_SECONDS = {
    live: 30 * 24 * 60 * 60,
    fallback: 60 * 60,
} as const;

const cacheKey = (year: number): string => `ru-work-calendar:${year}`;

/** Сетевой вызов: подменяется в тестах, по умолчанию — глобальный fetch. */
export type RuCalendarFetch = (
    url: string,
    init: RequestInit,
) => Promise<Response>;

/**
 * Производственный календарь РФ по годам с переносами: кэш Redis →
 * xmlcalendar.ru → isdayoff.ru → фиксированный список ТК РФ. Наружу
 * никогда не бросает: любая ошибка источников — `fallback` и один warn
 * (без Telegram: это не инцидент). Календарь общий для всех порталов —
 * поэтому Redis напрямую, а не портальный app-cache.
 */
@Injectable()
export class RuWorkCalendarService {
    private readonly logger = new Logger(RuWorkCalendarService.name);
    private fetcher: RuCalendarFetch = (url, init) => fetch(url, init);

    constructor(private readonly redis: RedisService) {}

    /** Для тестов: подменить сеть. */
    useFetch(fetcher: RuCalendarFetch): void {
        this.fetcher = fetcher;
    }

    /** Календарь года: кэш → источник → запасной список. Никогда не бросает. */
    async year(year: number): Promise<RuWorkCalendarYear> {
        const cached = await this.readCache(year);
        if (cached) return cached;
        const live =
            (await this.fromXmlCalendar(year)) ??
            (await this.fromIsDayOff(year));
        const result = live ?? fallbackRuCalendar(year);
        if (!live) {
            this.logger.warn(
                `Производственный календарь РФ ${year}: источники не ответили — список ТК РФ без переносов`,
            );
        }
        await this.writeCache(result);
        return result;
    }

    /** Несколько лет одним вызовом; ошибка одного не роняет остальные. */
    years(years: readonly number[]): Promise<RuWorkCalendarYear[]> {
        return Promise.all(years.map(year => this.year(year)));
    }

    private async fromXmlCalendar(
        year: number,
    ): Promise<RuWorkCalendarYear | null> {
        const body = await this.request(
            RU_WORK_CALENDAR_SOURCES_URL.xmlcalendar(year),
        );
        if (body === null) return null;
        try {
            return parseXmlCalendarJson(year, JSON.parse(body) as unknown);
        } catch {
            return null;
        }
    }

    private async fromIsDayOff(
        year: number,
    ): Promise<RuWorkCalendarYear | null> {
        const body = await this.request(
            RU_WORK_CALENDAR_SOURCES_URL.isdayoff(year),
        );
        return body === null ? null : parseIsDayOff(year, body);
    }

    /** GET с таймаутом и одной повторной попыткой; не 200 или сбой — null. */
    private async request(url: string): Promise<string | null> {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const response = await this.fetcher(url, {
                    signal: AbortSignal.timeout(RU_WORK_CALENDAR_TIMEOUT_MS),
                });
                if (response.ok) return await response.text();
            } catch {
                // повтор ниже; после второй неудачи — null
            }
        }
        return null;
    }

    private async readCache(year: number): Promise<RuWorkCalendarYear | null> {
        try {
            const raw = await this.redis.getClient().get(cacheKey(year));
            if (!raw) return null;
            const value = JSON.parse(raw) as RuWorkCalendarYear;
            return value.year === year && Array.isArray(value.holidays)
                ? value
                : null;
        } catch {
            return null;
        }
    }

    private async writeCache(value: RuWorkCalendarYear): Promise<void> {
        try {
            await this.redis
                .getClient()
                .set(
                    cacheKey(value.year),
                    JSON.stringify(value),
                    'EX',
                    RU_WORK_CALENDAR_TTL_SECONDS[value.source],
                );
        } catch (error) {
            this.logger.warn(
                `Кэш календаря РФ ${value.year} не записан: ${(error as Error).message}`,
            );
        }
    }
}
