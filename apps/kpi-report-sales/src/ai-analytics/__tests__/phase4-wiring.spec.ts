import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import { buildDailyPlanRopFacts } from '../domain/assembler/daily-plan-rop.facts';
import { qualityLinkFactsOf } from '../domain/assembler/portal-model.phase4';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import { AiPipelineRunContextFactory } from '../pipeline/run-context.factory';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';
import { qualityLinkSnapshot } from './fixtures/phase4-snapshots.fixture';

/**
 * Сшивка Фазы 4 вне модели портала: источник календаря в контексте
 * прогона (хвост 1; отказ загрузчика — запасной) и применение связи
 * качества в плане дня руководителя (режим data: p̂(S_ref) и S_req).
 */
const NOW = new Date('2026-09-08T01:00:00Z');

function factory(calendar: { load: jest.Mock }): AiPipelineRunContextFactory {
    return new AiPipelineRunContextFactory(
        settingsLoaderWith(),
        {
            load: jest.fn().mockResolvedValue({
                ctx: {},
                paramsVersion: 'pv',
                comparableFrom: '',
            }),
        } as never,
        { resolve: jest.fn().mockResolvedValue([10]) } as never,
        calendar as never,
    );
}

describe('run-context: источник календаря прогона', () => {
    it('источник загрузчика уходит в контекст', async () => {
        const { ctx } = await factory({
            load: jest.fn().mockResolvedValue({
                calendar: DEFAULT_WORK_CALENDAR,
                dayHours: 8,
                source: 'import',
                warnings: [],
            }),
        }).build({ domain: 'a.bitrix24.ru' } as never, 'nightly', NOW);

        expect(ctx.calendarSource).toBe('import');
    });

    it('отказ загрузчика — запасной календарь с оговоркой', async () => {
        const { ctx, warnings } = await factory({
            load: jest.fn().mockRejectedValue(new Error('scope calendar')),
        }).build({ domain: 'a.bitrix24.ru' } as never, 'nightly', NOW);

        expect(ctx.calendarSource).toBe('fallback');
        expect(warnings[0]).toContain('Производственный календарь не прочитан');
    });
});

describe('план дня руководителя: связь качества по данным', () => {
    const model = (
        over: Partial<PortalModelPayload>,
    ): Partial<PortalModelPayload> => ({
        edges: [],
        sRef: 7,
        cap: 0,
        lagCdf: { kind: 'exponential', medianDays: 28, n: 0, points: [] },
        ...over,
    });

    const run = (snapshotModel: Partial<PortalModelPayload>) =>
        buildDailyPlanRopFacts(
            {
                managerId: '10',
                snapshots: { model: snapshotModel, month: null },
            } as never,
            { elapsed: 5, left: 15 } as never,
            { items: [] } as never,
            { doneSales: 2, pipeline: 1, required: 60, target: 10 },
        );

    it('режим data: p̂(S_ref) по кривой модели', () => {
        const facts = run(
            model({
                betaSource: 'data',
                qualityLink: qualityLinkFactsOf(qualityLinkSnapshot()),
            }),
        );
        expect(facts.betaSource).toBe('data');
        expect(facts.normAtRefQuality).toBeCloseTo(0.35, 9);
    });

    it('без режима data — связи нет, числа нет', () => {
        const facts = run(
            model({
                betaSource: 'hypothesis',
                qualityLink: qualityLinkFactsOf(qualityLinkSnapshot()),
            }),
        );
        expect(facts.normAtRefQuality).toBeNull();
        expect(facts.sReq).toBeNull();
    });
});
