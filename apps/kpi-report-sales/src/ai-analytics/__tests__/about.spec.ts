import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { join } from 'node:path';
import { findParam, type ParamContext } from '@lib/sales-ai-analytics';
import {
    APP_AI_ANALYTICS_DIR,
    exportIndexOf,
    LIB_SRC_DIR,
    paramCodesReachableFrom,
    tsSourcesUnder,
} from '@lib/sales-ai-analytics/__tests__/param-codes.fixture';
import { AiAnalyticsAboutController } from '../about/ai-analytics-about.controller';
import {
    buildAiAnalyticsAbout,
    type AiAboutBuildInput,
} from '../about/ai-analytics-about.builder';
import {
    AI_ABOUT_ENDPOINT_TEXTS,
    AI_ABOUT_ENDPOINTS,
    AI_ABOUT_MODEL_REASONS,
    type AiAboutEndpoint,
} from '../about/ai-analytics-about.const';
import {
    AiAnalyticsAboutUseCase,
    buildAboutKey,
} from '../about/ai-analytics-about.use-case';
import { AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE } from '../constants/ai-analytics.const';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import type { AiAboutRequestDto } from '../dto/ai-about.dto';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';
import { recomputeModel } from './fixtures/recompute.fixture';

/**
 * Блок «Как считаем» (план §6, долг 26): текст каждой ручки содержит все
 * коды параметров, которые она использует (транзитивный скан исходников
 * ручки через fs — пересечение со списком инварианта (а)); блок
 * генерируется из реестра и снапшота, а не из литералов (мутация дефолта
 * реестра меняет значение в блоке); без снапшота модели — честная
 * деградация с причиной; ручка соблюдает правило self_view.
 */
const DOMAIN = 'april.bitrix24.ru';
const MODEL_ID = 'ais-model-about';

/** Файлы, с которых начинается каждая ручка (контроллер, use-case, шаг). */
const ENDPOINT_ENTRIES: Readonly<Record<AiAboutEndpoint, readonly string[]>> = {
    overview: [
        'ai-analytics-overview.controller.ts',
        'domain/use-cases/overview.use-case.ts',
        'domain/use-cases/overview-job.use-case.ts',
        'domain/use-cases/attention.use-case.ts',
        'domain/use-cases/by-type.use-case.ts',
    ],
    'plan/daily': [
        'ai-analytics-plan.controller.ts',
        'domain/use-cases/daily-plan.use-case.ts',
        'steps/forecast.step.ts',
    ],
    brief: [
        'ai-analytics-brief.controller.ts',
        'domain/use-cases/brief.use-case.ts',
        'domain/use-cases/brief-job.use-case.ts',
    ],
    'manager/style': [
        'style/ai-analytics-style.controller.ts',
        'style/style-profile.use-case.ts',
        'steps/style.step.ts',
    ],
};

function buildInput(
    overrides: Partial<AiAboutBuildInput> = {},
): AiAboutBuildInput {
    return {
        endpoint: 'overview',
        registry: {},
        paramsVersion: 'pv-about',
        comparableFrom: '',
        model: { id: MODEL_ID, payload: recomputeModel() },
        ...overrides,
    };
}

const withEdgesFrom = (
    source: 'default' | 'kleinman',
): Partial<PortalModelPayload> => {
    const model = recomputeModel();
    return {
        ...model,
        edges: model.edges.map(edge => ({ ...edge, kappaSource: source })),
    };
};

describe('about: текст ручки содержит все коды параметров, которые она использует', () => {
    const libIndex = exportIndexOf(tsSourcesUnder(LIB_SRC_DIR));

    it.each(AI_ABOUT_ENDPOINTS)('%s', endpoint => {
        const used = paramCodesReachableFrom(
            ENDPOINT_ENTRIES[endpoint].map(file =>
                join(APP_AI_ANALYTICS_DIR, file),
            ),
            [APP_AI_ANALYTICS_DIR, LIB_SRC_DIR],
            libIndex,
        );
        const listed = new Set<string>(
            AI_ABOUT_ENDPOINT_TEXTS[endpoint].params,
        );
        const missing = [...used].filter(code => !listed.has(code)).sort();
        const rendered = JSON.stringify(
            buildAiAnalyticsAbout(buildInput({ endpoint })),
        );

        expect(used.size).toBeGreaterThan(0);
        expect({ endpoint, missing }).toEqual({ endpoint, missing: [] });
        for (const code of listed) {
            expect(findParam(code)).toBeDefined();
            expect(rendered).toContain(`"code":"${code}"`);
        }
        expect(new Set(listed).size).toBe(
            AI_ABOUT_ENDPOINT_TEXTS[endpoint].params.length,
        );
    });
});

describe('about: блок генерируется из реестра и снапшота, не из литералов', () => {
    it('параметр несёт title, unit и описание дескриптора, значение и слой из resolveParam', () => {
        const registry: ParamContext = { portal: { n_min_none: 12 } };
        const about = buildAiAnalyticsAbout(buildInput({ registry }));
        const param = about.params.find(item => item.code === 'n_min_none');
        const descriptor = findParam('n_min_none');

        expect(param).toMatchObject({
            value: 12,
            layer: 'portal',
            kind: descriptor?.source,
            title: descriptor?.title,
            unit: descriptor?.unit,
            description: descriptor?.description,
            breaksSeries: descriptor?.breaksSeries,
        });
        expect(about.paramsVersion).toBe('pv-about');
    });

    it('мутация дефолта реестра меняет значение в блоке', () => {
        const descriptor = findParam('n_min_none') as { defaultValue: number };
        const original = descriptor.defaultValue;
        const before = buildAiAnalyticsAbout(buildInput()).params.find(
            item => item.code === 'n_min_none',
        );
        try {
            descriptor.defaultValue = original + 5;
            const after = buildAiAnalyticsAbout(buildInput()).params.find(
                item => item.code === 'n_min_none',
            );
            expect(before?.value).toBe(original);
            expect(after?.value).toBe(original + 5);
            expect(after?.layer).toBe('default');
        } finally {
            descriptor.defaultValue = original;
        }
    });

    it('значение слоя вне диапазона откатывается к дефолту с причиной', () => {
        const about = buildAiAnalyticsAbout(
            buildInput({ registry: { portal: { n_min_none: -1 } } }),
        );
        expect(
            about.params.find(item => item.code === 'n_min_none'),
        ).toMatchObject({ layer: 'default', reason: 'out-of-range' });
    });
});

describe('about: модель портала — readiness, κ/φ/λ с источником, estimand, санити', () => {
    it('κ hybrid до гейта Клейнмана, φ из реестра, λ configured; readiness и betaSource из модели', () => {
        const payload = recomputeModel();
        const about = buildAiAnalyticsAbout(buildInput());
        const model = about.model;

        expect(model?.modelSnapshotId).toBe(MODEL_ID);
        expect(model?.monthKey).toBe(payload.monthKey);
        expect(model?.kappa).toMatchObject({
            code: 'kappa_edge_late',
            symbol: 'κ',
            value: payload.kappa,
            source: 'hybrid',
        });
        expect(model?.phi).toMatchObject({
            value: payload.overdispersion.value,
            source: 'hybrid',
        });
        expect(model?.lambda).toMatchObject({
            code: 'forget_lambda',
            value: findParam('forget_lambda')?.defaultValue,
            source: 'configured',
        });
        expect(model?.readiness).toMatchObject({
            mode: payload.readiness.mode,
            reasons: payload.readiness.reasons,
            historyMonths: payload.readiness.historyMonths,
            betaSource: payload.betaSource,
        });
        expect(model?.estimand).toEqual({
            kind: payload.edgeKind,
            reason: payload.edgeKindReason,
            chainSharePct: payload.chainSharePct,
        });
        expect(model?.paramsVersion).toBe(payload.meta.paramsVersion);
        expect(model?.sanity).toBeNull();
        expect(about.modelReason).toBeNull();
    });

    it('κ estimated, когда рёбра оценены методом Клейнмана; configured — когда κ настроил портал', () => {
        const estimated = buildAiAnalyticsAbout(
            buildInput({
                model: { id: MODEL_ID, payload: withEdgesFrom('kleinman') },
            }),
        );
        const configured = buildAiAnalyticsAbout(
            buildInput({
                model: { id: MODEL_ID, payload: withEdgesFrom('default') },
                registry: { portal: { kappa_edge_late: 40 } },
            }),
        );
        expect(estimated.model?.kappa.source).toBe('estimated');
        expect(estimated.model?.kappa.note).toContain('открыт');
        expect(configured.model?.kappa.source).toBe('configured');
    });

    it('санити-панель модели доезжает до блока', () => {
        const payload: Partial<PortalModelPayload> = {
            ...recomputeModel(),
            sanity: {
                day: '2026-09-07',
                weekKey: '2026-W37',
                generatedAt: '2026-09-07T01:00:00.000Z',
                rules: [],
                warnings: ['цель оторвана от факта'],
                readiness: {
                    dataQuality: 'ok',
                    timestampLeak: null,
                    warningRules: ['target-vs-fact'],
                },
            },
        };
        const about = buildAiAnalyticsAbout(
            buildInput({ model: { id: MODEL_ID, payload } }),
        );
        expect(about.model?.sanity).toEqual({
            day: '2026-09-07',
            dataQuality: 'ok',
            warnings: ['цель оторвана от факта'],
            warningRules: ['target-vs-fact'],
        });
    });

    it('без снапшота модели — model = null с причиной, параметры остаются', () => {
        const about = buildAiAnalyticsAbout(buildInput({ model: null }));
        expect(about.model).toBeNull();
        expect(about.modelReason).toBe(AI_ABOUT_MODEL_REASONS.missing);
        expect(about.params.length).toBeGreaterThan(0);
    });
});

describe('AiAnalyticsAboutUseCase', () => {
    const request = (endpoint: AiAboutEndpoint = 'brief'): AiAboutRequestDto =>
        ({
            domain: DOMAIN,
            requesterUserId: '447',
            endpoint,
        }) as AiAboutRequestDto;
    const params = {
        load: jest.fn().mockResolvedValue({
            ctx: { portal: { brief_quota_per_day: 3 } },
            paramsVersion: 'pv-7',
            comparableFrom: '2026-06-01',
        }),
    };

    it('модель из стора: конверт ready, requestKey по ручке, значение слоя портала', async () => {
        const snapshots = {
            latestModel: jest
                .fn()
                .mockResolvedValue({ id: MODEL_ID, payload: recomputeModel() }),
        };
        const useCase = new AiAnalyticsAboutUseCase(
            params as never,
            snapshots as never,
        );

        const response = await useCase.execute(request());

        expect(response.status).toBe('ready');
        expect(response.requestKey).toBe(buildAboutKey(DOMAIN, 'brief'));
        expect(response.data.model?.modelSnapshotId).toBe(MODEL_ID);
        expect(response.data.comparableFrom).toBe('2026-06-01');
        expect(
            response.data.params.find(
                item => item.code === 'brief_quota_per_day',
            ),
        ).toMatchObject({ value: 3, layer: 'portal' });
        expect(snapshots.latestModel).toHaveBeenCalledWith(DOMAIN);
    });

    it('стор упал — блок по реестру с причиной «хранилище не ответило»', async () => {
        const useCase = new AiAnalyticsAboutUseCase(
            params as never,
            {
                latestModel: jest.fn().mockRejectedValue(new Error('ais down')),
            } as never,
        );

        const response = await useCase.execute(request('overview'));

        expect(response.data.model).toBeNull();
        expect(response.data.modelReason).toBe(
            AI_ABOUT_MODEL_REASONS.unavailable,
        );
        expect(response.data.endpoint).toBe('overview');
    });
});

describe('AiAnalyticsAboutController: POST /ai-analytics/about', () => {
    const leader: RequesterAccess = { role: 'op', visibleManagerIds: ['10'] };
    const manager: RequesterAccess = {
        role: 'manager',
        visibleManagerIds: ['10'],
    };

    function makeController(access: RequesterAccess, selfViewEnabled = false) {
        const accessService = new RequesterAccessService(
            {} as never,
            {} as never,
            settingsLoaderWith({ selfViewEnabled }),
        );
        jest.spyOn(accessService, 'resolve').mockResolvedValue(access);
        const execute = jest.fn().mockResolvedValue({
            status: 'ready',
            requestKey: buildAboutKey(DOMAIN, 'overview'),
            data: buildAiAnalyticsAbout(buildInput({ model: null })),
        });
        return {
            controller: new AiAnalyticsAboutController(accessService, {
                execute,
            } as never),
            execute,
        };
    }
    const dto = {
        domain: DOMAIN,
        requesterUserId: '447',
        endpoint: 'overview',
    } as AiAboutRequestDto;

    it('руководителю отдаётся конверт use-case’а', async () => {
        const { controller, execute } = makeController(leader);
        await expect(controller.getAbout(dto)).resolves.toMatchObject({
            status: 'ready',
            data: { endpoint: 'overview' },
        });
        expect(execute).toHaveBeenCalledWith(dto);
    });

    it('менеджеру без ai_analytics_self_view_enabled — 403', async () => {
        const { controller, execute } = makeController(manager, false);
        await expect(controller.getAbout(dto)).rejects.toThrow(
            new ForbiddenException(AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE),
        );
        expect(execute).not.toHaveBeenCalled();
    });

    it('менеджеру при включённой настройке ручка доступна', async () => {
        const { controller, execute } = makeController(manager, true);
        await expect(controller.getAbout(dto)).resolves.toMatchObject({
            status: 'ready',
        });
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
