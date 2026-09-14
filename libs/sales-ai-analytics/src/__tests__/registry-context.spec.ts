import { paramsVersion } from '../params/params-version';
import { isAiAnalyticsParamCode } from '../params/registry.const';
import { resolveNumberParam, resolveParam } from '../params/resolve';
import type { ParamContext } from '../params/registry.types';
import {
    defaultDefinitions,
    defaultTargets,
} from '../settings/ai-settings.defaults';
import {
    AI_DEFINITION_PARAM_CODES,
    buildRegistryContext,
} from '../settings/registry-context.builder';
import type { AiPortalDefinitions } from '../settings/ai-settings.types';

const definitionsWith = (
    overrides: Partial<AiPortalDefinitions> = {},
): AiPortalDefinitions => ({ ...defaultDefinitions(), ...overrides });

/** Все коды, которые контекст положил хоть в один слой. */
const emittedCodes = (ctx: ParamContext): string[] =>
    [ctx.portal, ctx.tenureBand, ctx.manager].flatMap(layer =>
        layer ? Object.keys(layer) : [],
    );

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
        expect(resolveParam('norm_stratum', ctx)).toMatchObject({
            value: 'level',
            source: 'portal',
        });
        expect(resolveParam('funnel_edges', ctx).value).toBe('e1,e2');
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
        expect(resolveParam('training_min_presentations', ctx)).toMatchObject({
            value: 5,
            source: 'manager',
        });
        expect(resolveParam('target_sales_by_level', ctx)).toMatchObject({
            value: 3,
            source: 'tenure',
        });
    });

    it('личная цель менеджера сильнее переопределения по id', () => {
        const ctx = buildRegistryContext({
            targets: { ...defaultTargets(), overrides: { '10': 6 } },
            managerId: '10',
            managerParams: { targetOverride: 9 },
        });

        expect(ctx.manager?.target_override).toBe(9);
    });

    it('свой календарь менеджера уходит в слой кодами workweek и time_zone', () => {
        const ctx = buildRegistryContext({
            managerParams: {
                workweek: [1, 2, 3, 4, 5, 6],
                timeZone: 'Asia/Yekaterinburg',
            },
        });

        expect(resolveParam('workweek', ctx)).toMatchObject({
            value: '1,2,3,4,5,6',
            source: 'manager',
        });
        expect(resolveParam('time_zone', ctx).value).toBe('Asia/Yekaterinburg');
    });

    it('каждый эмитируемый код разрешается реестром без причины отката', () => {
        const ctx = buildRegistryContext({
            definitions: definitionsWith({ confirmedOnly: true }),
            targets: {
                byLevel: {
                    ...defaultTargets().byLevel,
                    middle: { sales: 4, presentationsMin: 10, coldPerDay: 30 },
                },
                overrides: { '7': 5 },
            },
            tenureBand: 'middle',
            managerId: '7',
            managerParams: {
                fteShare: 0.75,
                trainingMinPresentations: 12,
                excludeFromNorms: true,
                workweek: [1, 2, 3, 4, 5],
                timeZone: 'Europe/Moscow',
            },
            model: { cycle_median_days: 30, s_ref: 6.5 },
        });
        const codes = emittedCodes(ctx);

        expect(codes.length).toBeGreaterThanOrEqual(18);
        for (const code of codes) {
            expect(isAiAnalyticsParamCode(code)).toBe(true);
            if (!isAiAnalyticsParamCode(code)) continue;
            const resolved = resolveParam(code, ctx);
            expect(`${code}:${resolved.reason ?? ''}`).toBe(`${code}:`);
            expect(resolved.source).not.toBe('default');
        }
    });

    it('карта полей определений покрывает все поля ключа', () => {
        const fields = Object.keys(defaultDefinitions()).sort();

        expect(Object.keys(AI_DEFINITION_PARAM_CODES).sort()).toEqual(fields);
        for (const code of Object.values(AI_DEFINITION_PARAM_CODES)) {
            expect(isAiAnalyticsParamCode(code)).toBe(true);
        }
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
