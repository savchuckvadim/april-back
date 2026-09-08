/**
 * Производственный календарь портала (план Фазы 2, поток 12
 * «p2-pipeline-runner»): импорт `calendar.settings.get` → переопределение
 * заданными полями ключа `ai_analytics_calendar` → запасной
 * производственный календарь РФ.
 *
 * ⚠ Деградация обязательна (§5.4): у части порталов нет scope `calendar`,
 * поэтому отказ метода НЕ бросает исключение — загрузчик отдаёт запасной
 * календарь РФ и предупреждение с пометкой телеграма. Ночной конвейер
 * из-за календаря не падает никогда.
 *
 * `@Injectable` без bitrix-состояния: инстанс берётся на вызов
 * (`PBXService.init(domain)`), в поля класса не кладётся.
 * Чистые разборы и проверки — в `calendar.util.ts` (лимит 300 строк).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { isBxCalendarUnavailable } from '@lib/bitrix/domain/calendar/consts/bx-calendar.const';
import type { BxCalendarSettingsResult } from '@lib/bitrix/domain/calendar/interface/bx-calendar.interface';
import { toPortalDate, WorkCalendar } from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_CACHE_PREFIX } from '../../constants/ai-analytics.const';
import {
    AI_CALENDAR_FALLBACK_DAY_HOURS,
    AiCalendarResult,
    calendarWarnings,
    hasCalendarOverride,
    parseBxDayHours,
    parseBxHolidays,
    parseBxWorkweek,
    ruWorkCalendar,
    yearsAround,
} from './calendar.util';
import { SettingsLoader } from './settings.loader';

export type { AiCalendarResult, AiCalendarSource } from './calendar.util';

export interface AiCalendarLoadOptions {
    /** Перечитать портал, игнорируя кэш. */
    forceRefresh?: boolean;
    /** Момент расчёта (время параметром, не `new Date()` внутри). */
    now?: Date;
}

/** Календарь года меняется редко — держим сутки; отказ портала — 2 минуты. */
export const AI_CALENDAR_TTL_SECONDS = 60 * 60 * 24;
export const AI_CALENDAR_ERROR_TTL_SECONDS = 120;

/** Ключ кэша календаря: год в ключе — праздники у каждого года свои. */
export function buildCalendarKey(domain: string, year: number): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:calendar:${year}`;
}

@Injectable()
export class AiAnalyticsCalendarLoader {
    private readonly logger = new Logger(AiAnalyticsCalendarLoader.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly settings: SettingsLoader,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    /** Календарь портала: импорт → переопределение настройками → РФ. */
    async load(
        domain: string,
        options: AiCalendarLoadOptions = {},
    ): Promise<AiCalendarResult> {
        const settings = await this.settings.load(domain);
        const timeZone = settings.calendar.timeZone;
        const now = options.now ?? new Date();
        const day = toPortalDate(now, timeZone);
        const year = Number(day.slice(0, 4));
        const key = buildCalendarKey(domain, year);
        const cached = options.forceRefresh
            ? null
            : await this.cache.getJson<AiCalendarResult>(key);
        if (cached) return cached;

        const imported = await this.importCalendar(domain, timeZone, year);
        const result = applyOverride(imported, settings.calendar);
        result.warnings.push(...calendarWarnings(result.calendar, day));
        this.report(domain, result);
        await this.store(key, result);
        return result;
    }

    /** Импорт `calendar.settings.get`; любой отказ → запасной календарь РФ. */
    private async importCalendar(
        domain: string,
        timeZone: string,
        year: number,
    ): Promise<AiCalendarResult> {
        let response: BxCalendarSettingsResult;
        try {
            const { bitrix } = await this.pbx.init(domain);
            response = await bitrix.calendar.settingsGetSafe();
        } catch (error) {
            return fallbackCalendar(timeZone, year, (error as Error).message);
        }
        if (!response.ok) {
            const suffix = isBxCalendarUnavailable(response.reason)
                ? 'метод недоступен порталу'
                : 'сбой вызова';
            return fallbackCalendar(
                timeZone,
                year,
                `${response.reason}: ${suffix}`,
            );
        }
        const { settings } = response;
        const dayHours = parseBxDayHours(settings);
        return {
            calendar: {
                timeZone,
                holidays: parseBxHolidays(
                    settings.year_holidays,
                    yearsAround(year),
                ),
                workweek: parseBxWorkweek(settings.week_holidays),
            },
            dayHours: dayHours ?? AI_CALENDAR_FALLBACK_DAY_HOURS,
            source: 'import',
            warnings:
                dayHours === null
                    ? [
                          'Производственный календарь портала: рабочий день ' +
                              `${String(settings.work_time_start)}–` +
                              `${String(settings.work_time_end)} не разобран ` +
                              `— берём ${AI_CALENDAR_FALLBACK_DAY_HOURS} ч`,
                      ]
                    : [],
        };
    }

    /** Оговорки календаря видит руководитель — значит, и телеграм. */
    private report(domain: string, result: AiCalendarResult): void {
        for (const warning of result.warnings) {
            this.logger.warn(warning, { telegram: true, domain });
        }
    }

    private async store(key: string, value: AiCalendarResult): Promise<void> {
        const ttl =
            value.source === 'fallback'
                ? AI_CALENDAR_ERROR_TTL_SECONDS
                : AI_CALENDAR_TTL_SECONDS;
        try {
            await this.cache.setJson(key, value, ttl);
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }
}

/** Запасной календарь РФ с объяснением, почему импорт не сработал. */
function fallbackCalendar(
    timeZone: string,
    year: number,
    reason: string,
): AiCalendarResult {
    return {
        calendar: ruWorkCalendar(year, timeZone),
        dayHours: AI_CALENDAR_FALLBACK_DAY_HOURS,
        source: 'fallback',
        warnings: [
            `Производственный календарь портала не прочитан (${reason}) — ` +
                'считаем по производственному календарю РФ',
        ],
    };
}

/** Заданные поля ключа `ai_analytics_calendar` важнее импорта. */
function applyOverride(
    base: AiCalendarResult,
    override: WorkCalendar,
): AiCalendarResult {
    if (!hasCalendarOverride(override)) {
        return { ...base, calendar: { ...base.calendar } };
    }
    return {
        ...base,
        source: 'override',
        calendar: {
            timeZone: override.timeZone,
            holidays:
                override.holidays.length > 0
                    ? [...override.holidays]
                    : [...base.calendar.holidays],
            workweek: [...override.workweek],
        },
    };
}
