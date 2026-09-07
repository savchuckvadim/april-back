import { BadRequestException } from '@nestjs/common';
import { OverviewUseCase } from '../domain/use-cases/overview.use-case';
import { AI_ANALYTICS_CALC_VERSION } from '../constants/ai-overview.const';
import {
    callsLoaderWith,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import {
    emptyFinance,
    emptyKpi,
    emptyPlans,
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_NOW,
    OVERVIEW_TO,
    twoManagersRows,
} from './fixtures/overview.fixture';

function makeUseCase(
    rows = twoManagersRows(),
    roster = [10, 20],
    disagreements = 0,
) {
    const calls = callsLoaderWith(rows);
    const managers = { resolve: jest.fn().mockResolvedValue(roster) };
    const kpi = {
        loadKpiMonths: jest.fn().mockResolvedValue(emptyKpi(roster)),
    };
    const finance = {
        loadFinance: jest.fn().mockResolvedValue(emptyFinance(roster)),
    };
    const plans = {
        loadPlans: jest.fn().mockResolvedValue(emptyPlans(roster)),
    };
    const org = { load: jest.fn().mockResolvedValue(new Map()) };
    const levels = {
        loadLevels: jest
            .fn()
            .mockResolvedValue(
                new Map([
                    [10, { managerId: 10, level: 'senior', since: null }],
                ]),
            ),
    };
    const feedback = {
        listInPeriod: jest.fn().mockResolvedValue(
            Array.from({ length: disagreements }, (_, index) => ({
                id: String(index),
                kind: 'disagree',
                object: 'call:x',
                managerId: '10',
                transcriptionId: null,
                requesterUserId: null,
                reason: null,
                createdAt: OVERVIEW_NOW,
            })),
        ),
    };
    const useCase = new OverviewUseCase(
        settingsLoaderWith(),
        managers as never,
        calls.loader,
        kpi as never,
        finance as never,
        plans as never,
        org as never,
        levels as never,
        feedback as never,
    );
    return { useCase, calls, managers, kpi, finance, plans, feedback };
}

const input = { domain: OVERVIEW_DOMAIN, from: OVERVIEW_FROM, to: OVERVIEW_TO };

describe('OverviewUseCase', () => {
    it('итоги по типам = суммы n по ячейкам менеджеров; период, версия, meta', async () => {
        const { useCase } = makeUseCase();
        const dto = await useCase.execute(input, { now: OVERVIEW_NOW });

        expect(dto.period).toMatchObject({
            from: OVERVIEW_FROM,
            to: OVERVIEW_TO,
            timeZone: 'Europe/Moscow',
            days: 28,
            workdays: 20,
        });
        expect(dto.calcVersion).toBe(AI_ANALYTICS_CALC_VERSION);
        expect(dto.managers.map(row => row.managerId)).toEqual(['10', '20']);
        for (const total of dto.totals) {
            const sum = dto.managers.reduce(
                (acc, row) =>
                    acc +
                    (row.byType.find(cell => cell.callType === total.callType)
                        ?.n ?? 0),
                0,
            );
            expect(total.n).toBe(sum);
        }
        const presentation = dto.totals.find(
            total => total.callType === 'presentation',
        );
        expect(presentation?.n).toBe(15);
        expect(presentation?.managers).toBe(2);
        expect(dto.meta).toMatchObject({
            totalCalls: 18,
            analyzedCalls: 18,
            skippedNoManager: 0,
            disagreementsCount: 0,
            fromCache: false,
            confirmedOnly: false,
            generatedAt: OVERVIEW_NOW.toISOString(),
        });
    });

    it('n < 8 → score.value = null (confidence none); n ≥ 8 → число', async () => {
        const { useCase } = makeUseCase();
        const dto = await useCase.execute(input, { now: OVERVIEW_NOW });
        const cellOf = (managerId: string, callType: string) =>
            dto.managers
                .find(row => row.managerId === managerId)
                ?.byType.find(cell => cell.callType === callType);

        const few = cellOf('20', 'presentation');
        expect(few?.n).toBe(5);
        expect(few?.score.value).toBeNull();
        expect(few?.score.confidence.level).toBe('none');
        expect(few?.explanation.text).toContain('мало данных');

        const enough = cellOf('10', 'presentation');
        expect(enough?.n).toBe(10);
        expect(enough?.score.value).not.toBeNull();
    });

    it('уровень из стора → manual, без записи → default', async () => {
        const { useCase } = makeUseCase();
        const dto = await useCase.execute(input, { now: OVERVIEW_NOW });
        expect(dto.managers[0]).toMatchObject({
            managerId: '10',
            level: 'senior',
            levelSource: 'manual',
        });
        expect(dto.managers[1]).toMatchObject({
            managerId: '20',
            level: 'middle',
            levelSource: 'default',
        });
    });

    it('период > 3 мес. или from > to → BadRequestException до загрузки', async () => {
        const { useCase, calls } = makeUseCase();
        await expect(
            useCase.execute({ ...input, from: '2026-05-01', to: '2026-09-06' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            useCase.execute({ ...input, from: '2026-09-07', to: '2026-09-06' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(calls.loadLite).not.toHaveBeenCalled();
    });

    it('loader’ы получают ростер, forceRefresh и now; звонки — за UTC-окно периода в TZ портала', async () => {
        const { useCase, calls, kpi, finance, plans, managers } = makeUseCase(
            twoManagersRows(),
            [10, 20],
            2,
        );
        const dto = await useCase.execute(
            { ...input, managerIds: [20, 10, 10], forceRefresh: true },
            { now: OVERVIEW_NOW },
        );
        expect(managers.resolve).toHaveBeenCalledWith(
            OVERVIEW_DOMAIN,
            [20, 10, 10],
        );
        expect(kpi.loadKpiMonths).toHaveBeenCalledWith(
            OVERVIEW_DOMAIN,
            OVERVIEW_FROM,
            OVERVIEW_TO,
            [10, 20],
            { forceRefresh: true, now: OVERVIEW_NOW },
        );
        expect(finance.loadFinance).toHaveBeenCalledWith(
            OVERVIEW_DOMAIN,
            OVERVIEW_FROM,
            OVERVIEW_TO,
            [10, 20],
            { forceRefresh: true, now: OVERVIEW_NOW },
        );
        expect(plans.loadPlans).toHaveBeenCalledWith(
            OVERVIEW_DOMAIN,
            [10, 20],
            { forceRefresh: true },
        );
        // 10.08 00:00 МСК = 09.08 21:00Z; 06.09 23:59:59.999 МСК = 06.09 20:59:59.999Z
        expect(calls.loadLite).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: OVERVIEW_DOMAIN,
                from: '2026-08-09T21:00:00.000Z',
                to: '2026-09-06T20:59:59.999Z',
            }),
        );
        expect(dto.meta.disagreementsCount).toBe(2);
    });

    it('менеджер ростера без звонков получает пустую строку', async () => {
        const { useCase } = makeUseCase(twoManagersRows(), [10, 20, 30]);
        const dto = await useCase.execute(input, { now: OVERVIEW_NOW });
        const idle = dto.managers.find(row => row.managerId === '30');
        expect(idle).toBeDefined();
        expect(idle?.callsTotal).toBe(0);
        expect(idle?.analyzedCalls).toBe(0);
        expect(idle?.keyMetric.value).toBeNull();
    });
});
