import { resolveNumberParam, resolveParam } from '@lib/sales-ai-analytics';
import { AiAnalyticsParamsLoader } from '../domain/loaders/params.loader';
import { portalSettings } from './fixtures/lite-row.fixture';
import type { AiAnalyticsPortalSettings } from '../domain/loaders/settings.loader';

const DOMAIN = 'april.bitrix24.ru';

/** Загрузчик параметров поверх подменённых настроек портала. */
function loaderWith(
    overrides: Partial<AiAnalyticsPortalSettings> = {},
): AiAnalyticsParamsLoader {
    const load = jest.fn().mockResolvedValue(portalSettings(overrides));
    return new AiAnalyticsParamsLoader({ load } as never);
}

describe('AiAnalyticsParamsLoader', () => {
    it('пустые настройки: контекст без слоёв, значения — дефолты реестра', async () => {
        const { ctx, paramsVersion, comparableFrom } =
            await loaderWith().load(DOMAIN);

        expect(ctx.tenureBand).toBeUndefined();
        expect(ctx.manager).toBeUndefined();
        expect(resolveNumberParam('forget_lambda', ctx)).toBe(0.85);
        expect(paramsVersion).toMatch(/^[0-9a-f]{64}$/);
        expect(comparableFrom).toBe('');
    });

    it('гиперпараметр портала перекрывает дефолт, версия параметров меняется', async () => {
        const plain = await loaderWith().load(DOMAIN);
        const tuned = await loaderWith({
            modelParams: { forget_lambda: 0.9 },
        }).load(DOMAIN);

        expect(resolveNumberParam('forget_lambda', tuned.ctx)).toBe(0.9);
        expect(resolveParam('forget_lambda', tuned.ctx).source).toBe('portal');
        expect(tuned.paramsVersion).not.toBe(plain.paramsVersion);
    });

    it('слой менеджера сильнее полосы стажа, полоса — сильнее портала', async () => {
        const { ctx } = await loaderWith({
            targets: {
                byLevel: {
                    junior: { sales: 3, presentationsMin: 20, coldPerDay: 40 },
                    middle: { sales: 5, presentationsMin: 0, coldPerDay: 30 },
                    senior: { sales: 8, presentationsMin: 0, coldPerDay: 20 },
                },
                overrides: { '10': 6 },
            },
            managerParams: {
                '10': { fteShare: 0.5, trainingMinPresentations: 5 },
            },
        }).load(DOMAIN, { managerId: '10', tenureBand: 'junior' });

        expect(ctx.tenureBand?.training_min_presentations).toBe(20);
        expect(ctx.manager?.training_min_presentations).toBe(5);
        expect(ctx.manager?.fte_share).toBe(0.5);
        expect(ctx.manager?.target_override).toBe(6);
        expect(ctx.tenureBand?.target_sales_by_level).toBe(3);
    });

    it('оценки портальной модели ложатся ниже решения человека', async () => {
        const { ctx } = await loaderWith({
            modelParams: { cycle_median_days: 40 },
        }).load(DOMAIN, { model: { cycle_median_days: 28, s_ref: 6.5 } });

        expect(ctx.portal?.cycle_median_days).toBe(40);
        expect(ctx.portal?.s_ref).toBe(6.5);
    });

    it('автособытие журнала задаёт начало сравнимой истории', async () => {
        const { comparableFrom } = await loaderWith({
            events: [
                { date: '2026-06-01', kind: 'script_change', source: 'manual' },
                {
                    date: '2026-09-07',
                    kind: 'settings_break',
                    source: 'auto',
                },
            ],
        }).load(DOMAIN);

        expect(comparableFrom).toBe('2026-09-07');
    });
});
