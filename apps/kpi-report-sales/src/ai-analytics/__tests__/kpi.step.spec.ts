import 'reflect-metadata';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { KpiStep } from '../steps/kpi.step';
import { createStepBus } from '../steps/step.types';
import {
    kpiManagerMonth,
    kpiMonth,
    kpiMonths,
    stepContext,
} from './fixtures/manager-snapshot.fixture';

/** Загрузчик KPI с готовым результатом и мок для проверки окна. */
function kpiLoaderWith(result: ReturnType<typeof kpiMonths>) {
    const loadKpiMonths = jest.fn().mockResolvedValue(result);
    return { loader: { loadKpiMonths } as never, loadKpiMonths };
}

const month = (fromCache: boolean) =>
    kpiMonth('2026-09', [kpiManagerMonth(10, { callDone: 100 })], {
        fromCache,
    });

describe('KpiStep — KPI-месяцы в шину', () => {
    it('код и ритмы шага: недельному ритму KPI не нужны', () => {
        const { loader } = kpiLoaderWith(kpiMonths([month(true)]));

        const step = new KpiStep(loader);

        expect(step.code).toBe('kpi');
        expect(step.rhythms).toEqual(['nightly', 'monthly', 'backfill']);
    });

    it('месяц прогона грузится по границам календарного месяца', async () => {
        const { loader, loadKpiMonths } = kpiLoaderWith(
            kpiMonths([month(true)]),
        );
        const bus = createStepBus();

        await new KpiStep(loader).run(stepContext(), bus);

        expect(loadKpiMonths).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            '2026-09-01',
            '2026-09-30',
            [10],
            expect.objectContaining({ forceRefresh: false }),
        );
        expect(bus.get(AI_PIPELINE_BUS_KEYS.kpiMonths)).toBeDefined();
    });

    it('закрытый месяц пришёл из кэша — Битрикс не звали', async () => {
        const { loader } = kpiLoaderWith(kpiMonths([month(true)]));

        const result = await new KpiStep(loader).run(
            stepContext(),
            createStepBus(),
        );

        expect(result.status).toBe('ok');
        expect(result.bitrixCalls).toBe(0);
        expect(result.rows).toBe(1);
    });

    it('месяц посчитан заново — поход в Битрикс учтён в журнале', async () => {
        const { loader } = kpiLoaderWith(kpiMonths([month(false)]));

        const result = await new KpiStep(loader).run(
            stepContext(),
            createStepBus(),
        );

        expect(result.bitrixCalls).toBe(1);
    });

    it('ростер пуст — шаг пропущен с причиной, загрузчик не зовётся', async () => {
        const { loader, loadKpiMonths } = kpiLoaderWith(
            kpiMonths([month(true)]),
        );

        const result = await new KpiStep(loader).run(
            stepContext({ managerIds: [] }),
            createStepBus(),
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('roster-empty');
        expect(loadKpiMonths).not.toHaveBeenCalled();
    });
});
