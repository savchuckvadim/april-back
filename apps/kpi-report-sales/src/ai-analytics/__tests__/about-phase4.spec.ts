import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PortalSessionGuard } from '@lib/auth';
import { AiAnalyticsAboutController } from '../about/ai-analytics-about.controller';
import { buildAiAnalyticsAbout } from '../about/ai-analytics-about.builder';
import {
    aboutForecastAccuracyOf,
    aboutPoolOf,
    aboutQualityLinkOf,
    aboutRecommendationsEffectOf,
    buildAboutPhase4,
} from '../about/ai-analytics-about.phase4.builder';
import { AI_ABOUT_ENDPOINTS } from '../about/ai-analytics-about.const';
import { qualityLinkFactsOf } from '../domain/assembler/portal-model.phase4';
import * as effectDto from '../dto/ai-about-phase4-effect.dto';
import * as poolDto from '../dto/ai-about-phase4-pool.dto';
import * as linkDto from '../dto/ai-about-phase4.dto';
import {
    backtestSnapshot,
    effectSnapshot,
    poolSnapshot,
    qualityLinkSnapshot,
} from './fixtures/phase4-snapshots.fixture';
import { recomputeModel } from './fixtures/recompute.fixture';

/**
 * «Как считаем» Фазы 4: секции связи качества, точности прогноза, пула и
 * эффекта советов из последних снапшотов (null-безопасно), ручка прогноза
 * в словаре, guard сессии портала на ручке about и примеры Swagger у
 * скаляров новых DTO.
 */
const LATEST = {
    forecastBacktest: backtestSnapshot(),
    recommendationEffect: effectSnapshot(),
    qualityLink: qualityLinkSnapshot(),
    pool: poolSnapshot(),
};

describe('about phase4: секции из снапшотов', () => {
    it('связь качества: оценки с интервалами, проверки и месяцы подряд', () => {
        expect(
            aboutQualityLinkOf(qualityLinkFactsOf(qualityLinkSnapshot())),
        ).toMatchObject({
            status: 'published',
            published: true,
            pooled: { value: 0.24, low: 0.17, high: 0.31 },
            reliability: 0.7,
            calibrationSlope: { value: 0.97, low: 0.81, high: 1.13 },
            placeboPassed: true,
            gatePassedMonths: 2,
            gateMonths: 2,
        });
        expect(aboutQualityLinkOf(null)).toBeNull();
    });

    it('связь качества до гейта: оценки не показываются, статус и проверки — да', () => {
        const base = qualityLinkFactsOf(qualityLinkSnapshot());
        expect(base).not.toBeNull();
        if (base === null) return;
        const facts = {
            ...base,
            status: 'estimated' as const,
            published: false,
            streak: 1,
        };
        const section = aboutQualityLinkOf(facts);

        expect(section).toMatchObject({
            status: 'estimated',
            published: false,
            within: null,
            between: null,
            pooled: null,
            calibrationSlope: { value: 0.97, low: 0.81, high: 1.13 },
            placeboPassed: true,
            gatePassedMonths: 1,
        });
    });

    it('точность прогноза: попадания и отношение ошибок с интервалами', () => {
        expect(aboutForecastAccuracyOf(backtestSnapshot())).toMatchObject({
            status: 'pass',
            shadowMonths: 10,
            shadowMinMonths: 9,
            coverage: { value: 0.82, low: 0.72, high: 0.89, n: 60 },
            coverageTarget: 0.8,
            errorVsLastMonth: { value: 0.67, low: 0.5, high: 0.85 },
            errorRatioMax: 1,
        });
        expect(
            aboutForecastAccuracyOf(
                backtestSnapshot({
                    status: 'insufficient',
                    reasons: ['not-enough-months'],
                    backtest: null,
                }),
            ),
        ).toMatchObject({
            coverage: null,
            errorVsLastMonth: null,
            reasons: ['not-enough-months'],
        });
    });

    it('пул: участники, вердикт портала, общая связь и вклад в модель', () => {
        const model = recomputeModel();
        expect(
            aboutPoolOf(
                poolSnapshot(),
                {
                    monthKey: '2026-09',
                    status: 'estimated',
                    eligible: 3,
                    kappaEdges: ['e1'],
                    globalPriorKappa: 0,
                    lagTable: true,
                    seasonPooled: false,
                    checkPrior: true,
                    beta: null,
                },
                {},
            ),
        ).toMatchObject({
            participants: 3,
            minParticipants: 3,
            selfReason: 'included',
            qualityLink: { value: 0.2, low: 0.12, high: 0.28 },
            heterogeneity: 0.35,
            label: 'hybrid',
            edgesFromPool: 1,
            lagFromPool: true,
        });
        expect(aboutPoolOf(null, model.pool, {})).toBeNull();
    });

    it('эффект советов: доли с интервалами и шаги воронки до/после', () => {
        expect(aboutRecommendationsEffectOf(effectSnapshot())).toMatchObject({
            status: 'pass',
            issued: 30,
            doneShare: { value: 0.67, low: 0.52, high: 0.79, n: 30 },
            beforeAfter: [
                {
                    edge: 'presentation_to_offer',
                    before: 0.3,
                    after: 0.42,
                    diff: { value: 0.12, low: 0.02, high: 0.22 },
                    windows: 12,
                },
            ],
            goodhartFlags: 0,
        });
    });

    it('снапшотов не читали — секций нет; снапшотов нет — null', () => {
        expect(
            buildAboutPhase4({ latest: null, model: null, registry: {} }),
        ).toEqual({});
        expect(
            buildAboutPhase4({
                latest: {
                    forecastBacktest: null,
                    recommendationEffect: null,
                    qualityLink: null,
                    pool: null,
                },
                model: null,
                registry: {},
            }),
        ).toEqual({
            qualityLink: null,
            forecastAccuracy: null,
            pool: null,
            recommendationsEffect: null,
        });
    });

    it('связь качества без снапшота берётся из модели портала', () => {
        const model = {
            ...recomputeModel(),
            qualityLink: qualityLinkFactsOf(qualityLinkSnapshot()),
        };
        expect(
            buildAboutPhase4({
                latest: { ...LATEST, qualityLink: null },
                model,
                registry: {},
            }).qualityLink?.status,
        ).toBe('published');
    });
});

describe('about phase4: блок ручки прогноза', () => {
    it('ручка forecast есть в словаре и собирается с секциями', () => {
        expect(AI_ABOUT_ENDPOINTS).toContain('forecast');
        const about = buildAiAnalyticsAbout({
            endpoint: 'forecast',
            registry: {},
            paramsVersion: 'pv',
            comparableFrom: '',
            model: { id: 'm', payload: recomputeModel() },
            phase4: LATEST,
        });
        expect(about.title).toBe('Прогноз продаж отдела на месяц');
        expect(about.howToRead[0]).toContain('8 из 10');
        expect(about.forecastAccuracy?.status).toBe('pass');
        expect(about.pool?.participants).toBe(3);
        expect(about.recommendationsEffect?.issued).toBe(30);
    });
});

describe('about phase4: guard и Swagger', () => {
    it('ручка about защищена сессией портала', () => {
        const handler = Object.getOwnPropertyDescriptor(
            AiAnalyticsAboutController.prototype,
            'getAbout',
        )?.value as object;
        const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ??
            []) as unknown[];
        expect(guards).toContain(PortalSessionGuard);
    });

    it.each([
        ['ai-about-phase4.dto', linkDto],
        ['ai-about-phase4-pool.dto', poolDto],
        ['ai-about-phase4-effect.dto', effectDto],
    ] as const)('%s: у скаляров и enum есть описание и пример', (name, dto) => {
        const classes = Object.values(dto).filter(
            (value): value is { name: string; prototype: object } =>
                typeof value === 'function',
        );
        expect(classes.length).toBeGreaterThan(0);
        for (const cls of classes) {
            const props = (Reflect.getMetadata(
                'swagger/apiModelPropertiesArray',
                cls.prototype,
            ) ?? []) as string[];
            for (const prop of props) {
                const meta = Reflect.getMetadata(
                    'swagger/apiModelProperties',
                    cls.prototype,
                    prop.replace(/^:/, ''),
                ) as {
                    type?: unknown;
                    enum?: unknown;
                    example?: unknown;
                    description?: unknown;
                };
                expect(typeof meta.description).toBe('string');
                const scalar =
                    meta.enum !== undefined ||
                    [String, Number, Boolean].includes(meta.type as never);
                if (scalar) {
                    expect({
                        cls: cls.name,
                        prop,
                        has: 'example' in meta,
                    }).toEqual({
                        cls: cls.name,
                        prop,
                        has: true,
                    });
                }
            }
        }
    });
});
