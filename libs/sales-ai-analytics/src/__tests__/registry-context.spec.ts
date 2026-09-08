import { paramsVersion } from '../params/params-version';
import { resolveNumberParam, resolveParam } from '../params/resolve';
import {
    defaultDefinitions,
    defaultTargets,
} from '../settings/ai-settings.defaults';
import { buildRegistryContext } from '../settings/registry-context.builder';
import type { AiPortalDefinitions } from '../settings/ai-settings.types';

const definitionsWith = (
    overrides: Partial<AiPortalDefinitions> = {},
): AiPortalDefinitions => ({ ...defaultDefinitions(), ...overrides });

describe('buildRegistryContext', () => {
    it('пустой вход — контекст без слоёв, значения остаются дефолтами', () => {
        const ctx = buildRegistryContext({});

        expect(ctx).toEqual({});
        expect(resolveNumberParam('forget_lambda', ctx)).toBe(0.85);
        expect(resolveParam('forget_lambda', ctx).source).toBe('default');
    });

    it('решение человека кладётся поверх оценки из портальной модели', () => {
        const ctx = buildRegistryContext({
            model: { cycle_median_days: 28, s_ref: 6.5 },
            modelParams: { cycle_median_days: 40 },
        });

        expect(ctx.portal?.cycle_median_days).toBe(40);
        expect(ctx.portal?.s_ref).toBe(6.5);
    });

    it('определения событий превращаются в коды реестра', () => {
        const ctx = buildRegistryContext({
            definitions: definitionsWith({
                normStratum: 'level',
                hotClientColors: ['green', 'yellow'],
                funnelEdges: ['e1', 'e2'],
            }),
        });

        expect(ctx.portal?.norm_stratum).toBe('level');
        expect(ctx.portal?.hot_client_colors).toBe('green,yellow');
        expect(ctx.portal?.funnel_edges).toBe('e1,e2');
        expect(ctx.portal?.min_duration_sec_by_type).toBe(300);
    });

    it('разные пороги по типам не превращаются в скалярный код', () => {
        const definitions = definitionsWith();
        const ctx = buildRegistryContext({
            definitions: {
                ...definitions,
                minDurationSecByType: {
                    ...definitions.minDurationSecByType,
                    cold: 60,
                },
            },
        });

        expect(ctx.portal?.min_duration_sec_by_type).toBeUndefined();
        expect(resolveNumberParam('min_duration_sec_by_type', ctx)).toBe(300);
    });

    it('слои полосы стажа и менеджера: менеджер сильнее', () => {
        const ctx = buildRegistryContext({
            targets: {
                byLevel: {
                    ...defaultTargets().byLevel,
                    junior: { sales: 3, presentationsMin: 20, coldPerDay: 40 },
                },
                overrides: { '10': 6 },
            },
            tenureBand: 'junior',
            managerId: '10',
            managerParams: { fteShare: 0.5, trainingMinPresentations: 5 },
        });

        expect(ctx.tenureBand?.training_min_presentations).toBe(20);
        expect(ctx.tenureBand?.target_sales_by_level).toBe(3);
        expect(ctx.manager?.training_min_presentations).toBe(5);
        expect(ctx.manager?.target_override).toBe(6);
        expect(ctx.manager?.fte_share).toBe(0.5);
    });

    it('личная цель менеджера сильнее переопределения по id', () => {
        const ctx = buildRegistryContext({
            targets: { ...defaultTargets(), overrides: { '10': 6 } },
            managerId: '10',
            managerParams: { targetOverride: 9 },
        });

        expect(ctx.manager?.target_override).toBe(9);
    });

    it('версия параметров детерминирована и меняется вместе с решением', () => {
        const base = buildRegistryContext({
            modelParams: { forget_lambda: 0.9 },
        });
        const same = buildRegistryContext({
            modelParams: { forget_lambda: 0.9 },
        });
        const other = buildRegistryContext({
            modelParams: { forget_lambda: 0.8 },
        });
        const version = (portal: Record<string, unknown>): string =>
            paramsVersion({ portalParams: portal as never });

        expect(version(base.portal ?? {})).toBe(version(same.portal ?? {}));
        expect(version(base.portal ?? {})).not.toBe(
            version(other.portal ?? {}),
        );
    });
});
