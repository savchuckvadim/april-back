import { LeadToWorkDeadlineService } from '../services/lead-to-work-deadline.service';
import { PortalWorkingHours } from '../../../shared/working-hours/working-hours.model';

/** Пн–пт 9:00–18:00. 30.09.2026 — среда. */
const OFFICE_HOURS: PortalWorkingHours = {
    startHour: 9,
    endHour: 18,
    weekHolidays: [0, 6],
    yearHolidays: new Set(),
    source: 'portal',
};

const ctx = {
    domain: 'd.b24.ru',
    portal: { getTimezone: () => 'Europe/Moscow' },
} as never;

const makeService = (slaMinutes: number | null = 60) => {
    const appSettings = {
        resolve: jest
            .fn()
            .mockResolvedValue({ leadIntakeSlaMinutes: slaMinutes }),
    };
    const workingHours = {
        resolve: jest.fn().mockResolvedValue({
            hours: OFFICE_HOURS,
            timezone: 'Europe/Moscow',
        }),
    };
    return {
        service: new LeadToWorkDeadlineService(
            appSettings as never,
            workingHours as never,
        ),
        appSettings,
    };
};

describe('LeadToWorkDeadlineService', () => {
    afterEach(() => jest.useRealTimers());

    /*
     * Робот ставит «Дату ХО» формулой +1 день, и задача уезжала на завтра.
     * Решение владельца 30.09.2026: при круге — час рабочего времени.
     */
    it('круг: «Дата ХО» робота игнорируется — час рабочего времени от назначения', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-30T14:20:00+03:00') });
        const { service } = makeService();

        const deadline = await service.resolve(ctx, {
            source: 'round-robin',
            isXo: 'Y',
            deadline: '01.10.2026 14:20:00',
        });

        expect(deadline).toBe('30.09.2026 15:20:00');
    });

    it('круг в 17:30 — срок 9:30 следующего рабочего дня', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-30T17:30:00+03:00') });
        const { service } = makeService();

        expect(
            await service.resolve(ctx, { source: 'round-robin', isXo: 'Y' }),
        ).toBe('01.10.2026 09:30:00');
    });

    it('круг: порог из настройки SLA, но не меньше часа', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-30T10:00:00+03:00') });

        const ninety = makeService(90);
        expect(
            await ninety.service.resolve(ctx, {
                source: 'round-robin',
                isXo: 'Y',
            }),
        ).toBe('30.09.2026 11:30:00');

        const ten = makeService(10);
        expect(
            await ten.service.resolve(ctx, {
                source: 'round-robin',
                isXo: 'Y',
            }),
        ).toBe('30.09.2026 11:00:00');
    });

    it('круг: настройки не прочитаны — час календарного времени', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-30T14:00:00+03:00') });
        const { service, appSettings } = makeService();
        appSettings.resolve.mockRejectedValue(new Error('БД недоступна'));

        expect(
            await service.resolve(ctx, { source: 'round-robin', isXo: 'Y' }),
        ).toBe('30.09.2026 15:00:00');
    });

    it('явный сотрудник: присланный срок остаётся, ночной — на начало рабочего дня', async () => {
        const { service } = makeService();

        expect(
            await service.resolve(ctx, {
                source: 'explicit',
                isXo: 'Y',
                deadline: '01.10.2026 14:00:00',
            }),
        ).toBe('01.10.2026 14:00:00');
        expect(
            await service.resolve(ctx, {
                source: 'explicit',
                isXo: 'Y',
                deadline: '01.10.2026 04:00:00',
            }),
        ).toBe('01.10.2026 09:00:00');
    });

    it('явный сотрудник без срока — без срока', async () => {
        const { service } = makeService();

        expect(
            await service.resolve(ctx, { source: 'explicit', isXo: 'Y' }),
        ).toBeUndefined();
    });

    it('повторная заявка без срока — сутки, в рабочее время', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-30T14:00:00+03:00') });
        const { service } = makeService();

        expect(
            await service.resolve(ctx, { source: 'repeat', isXo: 'Y' }),
        ).toBe('01.10.2026 14:00:00');
    });
});
