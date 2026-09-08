import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { DEFAULT_WORK_CALENDAR, WorkCalendar } from '@lib/sales-ai-analytics';
import type { BxCalendarSettingsResult } from '@lib/bitrix/domain/calendar/interface/bx-calendar.interface';
import {
    AI_CALENDAR_ERROR_TTL_SECONDS,
    AI_CALENDAR_TTL_SECONDS,
    AiAnalyticsCalendarLoader,
    buildCalendarKey,
} from '../domain/loaders/calendar.loader';
import {
    AI_CALENDAR_FALLBACK_DAY_HOURS,
    calendarWarnings,
    parseBxHolidays,
    parseBxWorkweek,
    ruWorkCalendar,
    workdaysInMonth,
} from '../domain/loaders/calendar.util';

const DOMAIN = 'a.bitrix24.ru';
/** 8 сентября 2026, 00:45 UTC = 03:45 МСК — момент ночного прогона. */
const NOW = new Date('2026-09-08T00:45:00Z');
const YEAR_HOLIDAYS = '1.1,7.1,23.2,8.3,1.5,9.5,12.6,4.11';

/** Ответ портала «всё хорошо» с возможностью подменить поля. */
function okResponse(
    overrides: Partial<{
        year_holidays: string;
        week_holidays: string[];
        work_time_start: string | number;
        work_time_end: string | number;
    }> = {},
): BxCalendarSettingsResult {
    return {
        ok: true,
        settings: {
            work_time_start: 9,
            work_time_end: 18,
            year_holidays: YEAR_HOLIDAYS,
            week_holidays: ['SA', 'SU'],
            ...overrides,
        },
    };
}

function makeLoader(
    response: BxCalendarSettingsResult | Error = okResponse(),
    portalCalendar: WorkCalendar = DEFAULT_WORK_CALENDAR,
    cached: unknown = null,
) {
    const settingsGetSafe = jest.fn(() =>
        response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve(response),
    );
    const init = jest.fn(() =>
        response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve({ bitrix: { calendar: { settingsGetSafe } } }),
    );
    const settings = {
        load: jest.fn().mockResolvedValue({
            enabled: true,
            calendar: portalCalendar,
        }),
    };
    const cache = {
        getJson: jest.fn().mockResolvedValue(cached),
        setJson: jest.fn().mockResolvedValue(undefined),
    };
    const loader = new AiAnalyticsCalendarLoader(
        { init } as never,
        settings as never,
        cache as never,
    );
    return { loader, init, settingsGetSafe, cache };
}

describe('calendar.util — чистые разборы производственного календаря', () => {
    it('«день.месяц» превращается в даты соседних годов', () => {
        const dates = parseBxHolidays('1.1,4.11,мусор,99.99', [2026]);

        expect(dates).toEqual(['2026-01-01', '2026-11-04']);
    });

    it('выходные дни недели портала дают рабочую неделю ISO', () => {
        expect(parseBxWorkweek(['SA', 'SU'])).toEqual([1, 2, 3, 4, 5]);
        expect(parseBxWorkweek(['SU'])).toEqual([1, 2, 3, 4, 5, 6]);
        expect(parseBxWorkweek([])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('запасной календарь РФ несёт праздники года и его соседей', () => {
        const calendar = ruWorkCalendar(2026);

        expect(calendar.holidays).toContain('2026-01-01');
        expect(calendar.holidays).toContain('2026-11-04');
        expect(calendar.holidays).toContain('2025-05-09');
        expect(calendar.holidays).toContain('2027-03-08');
        expect(calendar.workweek).toEqual([1, 2, 3, 4, 5]);
    });

    it('рабочие дни месяца считаются по календарю', () => {
        const calendar = ruWorkCalendar(2026);

        // 22 будних дня января минус шесть новогодних, попавших на будни.
        expect(workdaysInMonth('2026-01', calendar)).toBe(16);
        expect(workdaysInMonth('2026-09', calendar)).toBe(22);
    });
});

describe('AiAnalyticsCalendarLoader — импорт календаря портала', () => {
    it('импорт даёт праздники, рабочую неделю и длину рабочего дня', async () => {
        const { loader, cache } = makeLoader();

        const result = await loader.load(DOMAIN, { now: NOW });

        expect(result.source).toBe('import');
        expect(result.dayHours).toBe(9);
        expect(result.calendar.holidays).toContain('2026-01-01');
        expect(result.calendar.holidays).toContain('2026-11-04');
        expect(result.calendar.workweek).toEqual([1, 2, 3, 4, 5]);
        expect(result.calendar.timeZone).toBe('Europe/Moscow');
        expect(result.warnings).toEqual([]);
        expect(cache.setJson).toHaveBeenCalledWith(
            buildCalendarKey(DOMAIN, 2026),
            result,
            AI_CALENDAR_TTL_SECONDS,
        );
    });

    it('пустой ответ портала даёт запасной календарь РФ и предупреждение', async () => {
        const { loader, cache } = makeLoader({
            ok: false,
            reason: 'invalid-response',
            code: null,
            description: 'нет настроек',
        });

        const result = await loader.load(DOMAIN, { now: NOW });

        expect(result.source).toBe('fallback');
        expect(result.dayHours).toBe(AI_CALENDAR_FALLBACK_DAY_HOURS);
        expect(result.calendar.holidays).toContain('2026-01-01');
        expect(result.warnings[0]).toContain('invalid-response');
        expect(result.warnings[0]).toContain('производственному календарю РФ');
        expect(cache.setJson).toHaveBeenCalledWith(
            expect.any(String),
            result,
            AI_CALENDAR_ERROR_TTL_SECONDS,
        );
    });

    it('отсутствие прав на метод даёт деградацию, а не исключение', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { loader } = makeLoader({
            ok: false,
            reason: 'access-denied',
            code: 'ACCESS_DENIED',
            description: 'нет прав',
        });

        const result = await loader.load(DOMAIN, { now: NOW });

        expect(result.source).toBe('fallback');
        expect(result.warnings[0]).toContain('access-denied');
        expect(result.warnings[0]).toContain('метод недоступен порталу');
        expect(warn).toHaveBeenCalledWith(result.warnings[0], {
            telegram: true,
            domain: DOMAIN,
        });
        warn.mockRestore();
    });

    it('исключение вызова портала тоже гасится запасным календарём', async () => {
        const { loader } = makeLoader(new Error('таймаут'));

        const result = await loader.load(DOMAIN, { now: NOW });

        expect(result.source).toBe('fallback');
        expect(result.warnings[0]).toContain('таймаут');
    });

    it('заданные поля ключа настроек важнее импорта', async () => {
        const override: WorkCalendar = {
            timeZone: 'Asia/Yekaterinburg',
            holidays: ['2026-01-01', '2026-01-02'],
            workweek: [1, 2, 3, 4],
        };
        const { loader } = makeLoader(okResponse(), override);

        const result = await loader.load(DOMAIN, { now: NOW });

        expect(result.source).toBe('override');
        expect(result.calendar).toEqual(override);
    });

    it('«на год праздников нет» — предупреждение с пометкой телеграма', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { loader } = makeLoader(okResponse({ year_holidays: '' }));

        const result = await loader.load(DOMAIN, { now: NOW });

        const warning = result.warnings.find(item =>
            item.includes('на 2026 год праздников нет'),
        );
        expect(warning).toBeDefined();
        expect(warn).toHaveBeenCalledWith(warning, {
            telegram: true,
            domain: DOMAIN,
        });
        warn.mockRestore();
    });

    it('месяц с 24 рабочими днями — предупреждение с пометкой телеграма', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { loader } = makeLoader(okResponse({ week_holidays: ['SU'] }));

        const result = await loader.load(DOMAIN, { now: NOW });

        const warning = result.warnings.find(item =>
            item.includes('рабочих дней — больше 23'),
        );
        expect(result.calendar.workweek).toEqual([1, 2, 3, 4, 5, 6]);
        expect(warning).toBeDefined();
        expect(warn).toHaveBeenCalledWith(warning, {
            telegram: true,
            domain: DOMAIN,
        });
        warn.mockRestore();
    });

    it('нечитаемое время рабочего дня даёт запасную длину и оговорку', async () => {
        const { loader } = makeLoader(
            okResponse({ work_time_start: 19, work_time_end: 9 }),
        );

        const result = await loader.load(DOMAIN, { now: NOW });

        expect(result.dayHours).toBe(AI_CALENDAR_FALLBACK_DAY_HOURS);
        expect(result.warnings[0]).toContain('не разобран');
    });

    it('кэш года отдаётся без обращения к порталу', async () => {
        const cached = {
            calendar: ruWorkCalendar(2026),
            dayHours: 9,
            source: 'import',
            warnings: [],
        };
        const { loader, init } = makeLoader(okResponse(), undefined, cached);

        const result = await loader.load(DOMAIN, { now: NOW });

        expect(result).toBe(cached);
        expect(init).not.toHaveBeenCalled();
    });

    it('forceRefresh перечитывает портал, игнорируя кэш', async () => {
        const cached = {
            calendar: ruWorkCalendar(2026),
            dayHours: 9,
            source: 'import',
            warnings: [],
        };
        const { loader, init } = makeLoader(okResponse(), undefined, cached);

        await loader.load(DOMAIN, { now: NOW, forceRefresh: true });

        expect(init).toHaveBeenCalledWith(DOMAIN);
    });
});

describe('calendarWarnings — оговорки календаря', () => {
    it('календарь РФ пятидневки предупреждений не даёт', () => {
        expect(calendarWarnings(ruWorkCalendar(2026), '2026-09-08')).toEqual(
            [],
        );
    });

    it('шестидневка без праздников даёт обе оговорки', () => {
        const warnings = calendarWarnings(
            {
                timeZone: 'Europe/Moscow',
                holidays: [],
                workweek: [1, 2, 3, 4, 5, 6],
            },
            '2026-09-08',
        );

        expect(warnings[0]).toContain('на 2026 год праздников нет');
        expect(warnings.length).toBeGreaterThan(1);
    });
});
