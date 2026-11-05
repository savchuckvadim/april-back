import type { PBXService } from '@/modules/pbx';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import type { ManagersLoader } from '../domain/loaders/managers.loader';
import { PulseTelephonyLoader } from '../domain/loaders/pulse-telephony.loader';
import { pulseTelephonyUserIds } from '../domain/loaders/pulse-telephony.scope';
import type { AiCallReportStatus } from '../domain/loaders/settings.loader';
import { PulseUseCase } from '../domain/use-cases/pulse.use-case';
import { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import {
    calendarLoaderWith,
    telephonyWith,
} from './fixtures/pulse-deps.fixture';
import { smartLinksWith } from './fixtures/smart-links.fixture';

const report = (patch: Partial<AiCallReportStatus>): AiCallReportStatus => ({
    enabled: true,
    pilotUserIds: null,
    salesOnly: null,
    minDurationSec: null,
    ...patch,
});

describe('pulseTelephonyUserIds — круг сотрудников как у скана конвейера', () => {
    it('пилот ∩ отдел продаж; пустое пересечение — пилот как есть', () => {
        expect(
            pulseTelephonyUserIds({
                callReport: report({ pilotUserIds: [1, 174, 194] }),
                salesRoster: [174, 194, 222],
            }),
        ).toEqual([174, 194]);
        expect(
            pulseTelephonyUserIds({
                callReport: report({ pilotUserIds: [1] }),
                salesRoster: [174],
            }),
        ).toEqual([1]);
    });

    it('без пилота — отдел продаж; «не только отдел продаж» и без пилота — весь портал', () => {
        expect(
            pulseTelephonyUserIds({
                callReport: undefined,
                salesRoster: [5, 6],
            }),
        ).toEqual([5, 6]);
        expect(
            pulseTelephonyUserIds({
                callReport: report({ salesOnly: false }),
                salesRoster: [5, 6],
            }),
        ).toBeUndefined();
        expect(
            pulseTelephonyUserIds({ callReport: undefined, salesRoster: [] }),
        ).toBeUndefined();
    });
});

/** PBXService-заглушка: ответы voximplant.statistic.get по очереди. */
function pbxWith(responses: (Record<string, unknown> | Error)[]): {
    pbx: PBXService;
    calls: Record<string, unknown>[];
} {
    const calls: Record<string, unknown>[] = [];
    let index = 0;
    const call = (_method: string, data: Record<string, unknown>) => {
        calls.push(data);
        const next = responses[index] ?? {};
        index += 1;
        return next instanceof Error
            ? Promise.reject(next)
            : Promise.resolve(next);
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({ bitrix: { api: { call } } }),
    } as unknown as PBXService;
    return { pbx, calls };
}

const managersWith = (ids: number[]) => {
    const resolve = jest.fn().mockResolvedValue(ids);
    return { loader: { resolve } as unknown as ManagersLoader, resolve };
};

const INPUT = {
    from: '2026-10-29',
    to: '2026-11-03',
    timeZone: 'Europe/Moscow',
    minDurationSec: 220,
};

describe('PulseTelephonyLoader', () => {
    it('два запроса total: разговоры (> 0 с) и короче порога, по сотрудникам разбора', async () => {
        const { pbx, calls } = pbxWith([
            { result: [], total: 410 },
            { result: [], total: 391 },
        ]);
        const managers = managersWith([174, 194]);
        const share = await new PulseTelephonyLoader(
            pbx,
            managers.loader,
        ).shortShare('april-garant.bitrix24.ru', INPUT);

        expect(share).toEqual({ connected: 410, short: 391 });
        expect(calls).toHaveLength(2);
        expect(calls[0].FILTER).toEqual({
            '>=CALL_START_DATE': '2026-10-28T21:00:00.000Z',
            '<=CALL_START_DATE': '2026-11-03T20:59:59.999Z',
            '>=CALL_DURATION': 1,
            PORTAL_USER_ID: ['174', '194'],
        });
        expect(calls[1].FILTER).toMatchObject({ '<CALL_DURATION': 220 });
    });

    it('без отдела продаж и пилота — весь портал, ростер не читается', async () => {
        const { pbx, calls } = pbxWith([{ total: 10 }, { total: 4 }]);
        const managers = managersWith([174]);
        const share = await new PulseTelephonyLoader(
            pbx,
            managers.loader,
        ).shortShare('d', {
            ...INPUT,
            callReport: report({ salesOnly: false }),
        });

        expect(share).toEqual({ connected: 10, short: 4 });
        expect(managers.resolve).not.toHaveBeenCalled();
        expect(calls[0].FILTER).not.toHaveProperty('PORTAL_USER_ID');
    });

    it('сбой Битрикса или нет total — null, а не ноль', async () => {
        const failing = pbxWith([new Error('socket hang up')]);
        expect(
            await new PulseTelephonyLoader(
                failing.pbx,
                managersWith([1]).loader,
            ).shortShare('d', INPUT),
        ).toBeNull();

        const noTotal = pbxWith([{ result: [] }, { total: 3 }]);
        expect(
            await new PulseTelephonyLoader(
                noTotal.pbx,
                managersWith([1]).loader,
            ).shortShare('d', INPUT),
        ).toBeNull();
    });
});

describe('PulseUseCase: календарь с праздниками, дни без звонков, телефония', () => {
    /** Суббота 05.09.2026 12:00 MSK; пятница 04.09 — праздник портала. */
    const NOW = new Date('2026-09-05T09:00:00Z');
    const day = (date: string, index: number) =>
        liteRow({
            transcriptionId: `${date}-${index}`,
            managerId: '10',
            callStartedAt: new Date(`${date}T08:00:00Z`),
        });
    const rows = [
        '2026-08-28',
        '2026-08-31',
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
    ].flatMap(date => [day(date, 1), day(date, 2)]);
    const feedback = {
        listInPeriod: jest.fn().mockResolvedValue([]),
    } as unknown as AiAnalyticsFeedbackStore;

    it('праздник из производственного календаря закрывает окно днём раньше; доля коротких — из телефонии', async () => {
        const calendar = calendarLoaderWith({
            ...DEFAULT_WORK_CALENDAR,
            holidays: ['2026-09-04'],
        });
        const telephony = telephonyWith({ connected: 40, short: 10 });
        const useCase = new PulseUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith(),
            feedback,
            smartLinksWith().loader,
            calendar.loader,
            telephony.loader,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.periodDate).toBe('2026-09-03');
        expect(dto.window.workdays).toEqual([
            '2026-08-28',
            '2026-08-31',
            '2026-09-01',
            '2026-09-02',
            '2026-09-03',
        ]);
        expect(dto.analyzedCalls).toBe(10);
        expect(telephony.shortShare).toHaveBeenCalledWith(
            'd',
            expect.objectContaining({
                from: '2026-08-28',
                to: '2026-09-03',
                timeZone: 'Europe/Moscow',
                minDurationSec: 300,
            }),
        );
        expect(dto.shortCallsSharePct).toBe(25);
        expect(dto.connectedCalls).toBe(40);
    });

    it('рабочий день без звонков календарь не знает — окно берёт день раньше', async () => {
        // 03.09 — рабочий четверг без единого звонка
        const quiet = rows.filter(
            item => !item.transcriptionId.startsWith('2026-09-03'),
        );
        const useCase = new PulseUseCase(
            callsLoaderWith(quiet).loader,
            settingsLoaderWith(),
            feedback,
            smartLinksWith().loader,
            calendarLoaderWith().loader,
            telephonyWith({ connected: 0, short: 0 }).loader,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.periodDate).toBe('2026-09-04');
        expect(dto.window.workdays).toEqual([
            '2026-08-28',
            '2026-08-31',
            '2026-09-01',
            '2026-09-02',
            '2026-09-04',
        ]);
        expect(dto.shortCallsSharePct).toBe(0);
    });
});
