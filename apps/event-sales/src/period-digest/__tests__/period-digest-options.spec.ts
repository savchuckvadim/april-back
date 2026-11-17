import {
    EnumPortalAppCode,
    getPortalAppDefaults,
} from '@lib/portal-lib/store/app-settings';
import { DIGEST_DEFAULT_SHIFT } from '@lib/sales-ai-analytics';
import { ETimeZone } from '@lib/shared/lib/date';
import { periodDigestOptionsOf } from '../lib/period-digest-options';

const DEFAULTS = getPortalAppDefaults(EnumPortalAppCode.eventSales);

describe('настройки итогов периода → параметры прогона', () => {
    it('по умолчанию: обе политики, РОПу, сроки 3 и 5, пороги карточки по умолчанию', () => {
        const options = periodDigestOptionsOf(DEFAULTS);

        expect(options.kinds).toEqual(['week', 'month']);
        expect(options.policies.map(policy => policy.kind)).toEqual([
            'week',
            'month',
        ]);
        expect(options.recipients).toEqual({
            toHead: true,
            toEmployee: false,
            departmentUserIds: [],
            structureUserIds: [],
        });
        expect(options.excludeUserIds.size).toBe(0);
        expect(options.deadlineDays).toEqual({ week: 3, month: 5 });
        expect(options.analytics).toEqual({
            minCalls: 5,
            shift: DIGEST_DEFAULT_SHIFT,
        });
    });

    it('пока доставки нет — только подсчёт, что бы ни стояло в настройке и в запросе', () => {
        expect(
            periodDigestOptionsOf({
                ...DEFAULTS,
                periodDigestCountOnly: false,
            }).countOnly,
        ).toBe(true);
        expect(
            periodDigestOptionsOf(DEFAULTS, { countOnly: false }).countOnly,
        ).toBe(true);
    });

    it('виды, получатели и пороги из настроек портала', () => {
        const options = periodDigestOptionsOf({
            ...DEFAULTS,
            periodDigestKinds: 'month',
            periodDigestToHead: false,
            periodDigestDepartmentUserIds: '7, 9',
            periodDigestUserIds: '1',
            periodDigestExcludeUserIds: '42;43',
            periodDigestMinCalls: 8,
            periodDigestShiftShare: 15,
        });

        expect(options.kinds).toEqual(['month']);
        expect(options.policies.map(policy => policy.kind)).toEqual(['month']);
        expect(options.recipients).toMatchObject({
            toHead: false,
            departmentUserIds: [7, 9],
            structureUserIds: [1],
        });
        expect([...options.excludeUserIds]).toEqual([42, 43]);
        expect(options.analytics.minCalls).toBe(8);
        expect(options.analytics.shift.share).toBe(0.15);
    });

    it('мусор в дне, часе и сроках — значения по умолчанию; пустые виды — без политик', () => {
        const options = periodDigestOptionsOf({
            ...DEFAULTS,
            periodDigestKinds: '',
            periodDigestWeekday: 9,
            periodDigestHour: 25,
            periodDigestDeadlineDaysWeek: 0,
            periodDigestDeadlineDaysMonth: 'долго',
        });

        expect(options.kinds).toEqual([]);
        expect(options.policies).toEqual([]);
        expect(options.deadlineDays).toEqual({ week: 3, month: 5 });
    });

    it('неделя выпускается в день и час настройки и только в рабочий день', () => {
        const [week] = periodDigestOptionsOf({
            ...DEFAULTS,
            periodDigestKinds: 'week',
            periodDigestWeekday: 2,
            periodDigestHour: 10,
        }).policies;
        const check = (iso: string, workday = true) =>
            week.due({
                now: new Date(iso),
                timezone: ETimeZone.EUROPE_MOSCOW,
                calendar: { isWorkday: () => workday },
            });

        // Вторник 17.11.2026, 10:00 МСК — прошлая неделя W46.
        expect(check('2026-11-17T07:00:00Z')?.key).toBe('2026-W46');
        // Вторник, 09:00 МСК — ещё рано.
        expect(check('2026-11-17T06:00:00Z')).toBeNull();
        // Понедельник — день ещё не наступил.
        expect(check('2026-11-16T08:00:00Z')).toBeNull();
        // Нерабочий день — не выпускается.
        expect(check('2026-11-17T07:00:00Z', false)).toBeNull();
    });
});
