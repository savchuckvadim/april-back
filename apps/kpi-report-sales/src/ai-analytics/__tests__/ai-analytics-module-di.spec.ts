import 'reflect-metadata';
import type { DynamicModule, FactoryProvider } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { BxDepartmentModule } from '@lib/bx-department';
import { WsService } from '@/core/ws';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiAnalyticsAboutModule } from '../about/ai-analytics-about.module';
import { AiAnalyticsModule } from '../ai-analytics.module';
import { AiAnalyticsBriefModule } from '../brief/ai-analytics-brief.module';
import {
    AI_ANALYTICS_CORE_PBX_PROVIDERS,
    AiAnalyticsCorePbxModule,
} from '../core/ai-analytics-core-pbx.module';
import {
    AI_ANALYTICS_CORE_PROVIDERS,
    AiAnalyticsCoreModule,
} from '../core/ai-analytics-core.module';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import { AiAnalyticsPassportModule } from '../passport/ai-analytics-passport.module';
import {
    AI_ANALYTICS_PIPELINE_STEP_MODULES,
    AI_ANALYTICS_PIPELINE_STEP_ORDER,
    AiAnalyticsPipelineModule,
} from '../pipeline/ai-analytics-pipeline.module';
import { AiAnalyticsPlanModule } from '../plan/ai-analytics-plan.module';
import { AiAnalyticsPortalModelModule } from '../portal-model/ai-analytics-portal-model.module';
import { AiAnalyticsRopMarkModule } from '../rop-mark/ai-analytics-rop-mark.module';
import { AiAnalyticsSnapshotsModule } from '../snapshots/ai-analytics-snapshots.module';
import { AiAnalyticsStageHistoryModule } from '../stage-history/ai-analytics-stage-history.module';
import {
    AI_ANALYTICS_PIPELINE_STEPS,
    AI_ANALYTICS_SNAPSHOT_RUNNER,
    type AiAnalyticsPipelineStep,
} from '../steps/step.types';
import { AiAnalyticsStyleModule } from '../style/ai-analytics-style.module';
import {
    availableIn,
    exportsOf,
    metadataList,
    type Ctor,
} from './fixtures/module-di.util';

/**
 * Статическая проверка DI-графа сборки AI-аналитики (поток 19): каждая
 * зависимость конструктора провайдера и контроллера обязана быть
 * доступна в модуле или в экспортах его импортов; поверхность API
 * приложения — ровно семь контроллеров фичи; конвейер собран целиком;
 * общие провайдеры объявлены один раз (ядро); глобальные провайдеры —
 * только из белого списка.
 *
 * Помимо фикстуры `module-di.util` здесь свои помощники: динамические
 * модули (`registerPhase2()` — объект, а не класс) и зависимости по
 * токену (`@Inject(...)`, `@InjectMetric(...)`), которые фикстура не
 * различает.
 */

/**
 * Глобальные провайдеры приложения — белый список: AppCacheService
 * (AppCacheModule — @Global) и WsService (WsModule — @Global; срез резюме
 * шлёт WS done/error, не импортируя WsModule).
 */
const GLOBAL_PROVIDERS: Ctor[] = [AppCacheService, WsService];

/**
 * Поддеревья, чьи роуты приложение публикует и без AI-аналитики: их
 * контроллеры — забота владельцев, поэтому обход в них не заходит.
 * BxDepartmentModule и TelegramModule импортирует сам корень
 * kpi-report-sales, PBXModule был в модуле фичи с Фазы 1a (его поддерево
 * несёт TelegramController и FrontPortalController).
 */
const APP_PUBLISHED_SUBTREES = new Set<Ctor>([
    BxDepartmentModule,
    TelegramModule,
    PBXModule,
]);

const EXPECTED_CONTROLLERS = [
    'AiAnalyticsAboutController',
    'AiAnalyticsBriefController',
    'AiAnalyticsController',
    'AiAnalyticsOverviewController',
    'AiAnalyticsPlanController',
    'AiAnalyticsRopMarkController',
    'AiAnalyticsStyleController',
];

/** Модули фичи, в которых объявлены провайдеры (для проверки дублей). */
const FEATURE_MODULES: Ctor[] = [
    AiAnalyticsModule,
    AiAnalyticsCoreModule,
    AiAnalyticsCorePbxModule,
    AiAnalyticsPipelineModule,
    AiAnalyticsSnapshotsModule,
    AiAnalyticsPassportModule,
    AiAnalyticsStageHistoryModule,
    AiAnalyticsRopMarkModule,
    AiAnalyticsPortalModelModule,
    AiAnalyticsPlanModule,
    AiAnalyticsBriefModule,
    AiAnalyticsStyleModule,
    AiAnalyticsAboutModule,
];

type StepCtor = new (...args: never[]) => AiAnalyticsPipelineStep;

function isDynamicModule(item: unknown): item is DynamicModule {
    return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { module?: unknown }).module === 'function'
    );
}

/** Импорты модуля с раскрытием динамических (класс + его imports). */
function importsOf(module: Ctor): Ctor[] {
    const raw =
        (Reflect.getMetadata('imports', module) as unknown[] | undefined) ?? [];
    return raw.flatMap(item => {
        if (typeof item === 'function') return [item as Ctor];
        if (!isDynamicModule(item)) return [];
        const nested = (item.imports ?? []).filter(
            (imported): imported is Ctor => typeof imported === 'function',
        );
        return [item.module as Ctor, ...nested];
    });
}

/**
 * Транзитивные импорты без поддеревьев, опубликованных приложением. Каждый
 * модуль — один раз: срез rop-mark достижим и напрямую, и через конвейер,
 * а контроллер у него один.
 */
function importsDeep(module: Ctor, seen = new Set<Ctor>([module])): Ctor[] {
    return importsOf(module).flatMap(imported => {
        if (seen.has(imported) || APP_PUBLISHED_SUBTREES.has(imported)) {
            return [];
        }
        seen.add(imported);
        return [imported, ...importsDeep(imported, seen)];
    });
}

const PRIMITIVES: unknown[] = [
    Object,
    String,
    Number,
    Boolean,
    Array,
    Function,
];

/**
 * Классовые зависимости конструктора без тех, что инжектятся по токену
 * (`self:paramtypes` — метаданные @Inject): у метрик конвейера в
 * paramtypes стоят Counter/Histogram prom-client, а провайдер — токен.
 */
function classDependenciesOf(unit: Ctor): Ctor[] {
    const params =
        (Reflect.getMetadata('design:paramtypes', unit) as
            | unknown[]
            | undefined) ?? [];
    const byToken = new Set(
        (
            (Reflect.getMetadata('self:paramtypes', unit) as
                | { index: number }[]
                | undefined) ?? []
        ).map(item => item.index),
    );
    return params.filter(
        (param, index): param is Ctor =>
            !byToken.has(index) &&
            typeof param === 'function' &&
            !PRIMITIVES.includes(param),
    );
}

/** Незакрытые зависимости модуля строками «Провайдер → Зависимость». */
function missingOf(module: Ctor, globals: Ctor[]): string[] {
    const available = availableIn(module, globals);
    for (const imported of importsOf(module)) {
        for (const exported of exportsOf(imported)) available.add(exported);
    }
    const units = [
        ...metadataList(module, 'providers'),
        ...metadataList(module, 'controllers'),
    ];
    return units.flatMap(unit =>
        classDependenciesOf(unit)
            .filter(dependency => !available.has(dependency))
            .map(dependency => `${unit.name} → ${dependency.name}`),
    );
}

function pipelineDynamicModule(): DynamicModule {
    const raw =
        (Reflect.getMetadata('imports', AiAnalyticsModule) as unknown[]) ?? [];
    const dynamic = raw.find(
        item =>
            isDynamicModule(item) && item.module === AiAnalyticsPipelineModule,
    );
    if (!isDynamicModule(dynamic)) {
        throw new Error('AiAnalyticsModule не импортирует конвейер');
    }
    return dynamic;
}

describe('DI-граф AiAnalyticsModule (kpi-report-sales)', () => {
    it('все зависимости провайдеров и контроллеров доступны в модуле', () => {
        const units = [
            ...metadataList(AiAnalyticsModule, 'providers'),
            ...metadataList(AiAnalyticsModule, 'controllers'),
        ];
        expect(units.length).toBeGreaterThan(0);
        expect(missingOf(AiAnalyticsModule, GLOBAL_PROVIDERS)).toEqual([]);
    });

    it.each(FEATURE_MODULES)(
        '%p: глобальные провайдеры — только из белого списка',
        module => {
            expect(missingOf(module, GLOBAL_PROVIDERS)).toEqual([]);
        },
    );

    it('поверхность API — ровно семь контроллеров фичи, чужих через транзитивные импорты нет', () => {
        const graph = [AiAnalyticsModule, ...importsDeep(AiAnalyticsModule)];
        const controllers = graph
            .flatMap(module => metadataList(module, 'controllers'))
            .map(controller => controller.name)
            .sort();
        expect(controllers).toEqual(EXPECTED_CONTROLLERS);
        // Проверка не пустая: цепочка резюме действительно раскрыта.
        const names = graph.map(module => module.name);
        expect(names).toContain('VibecodeModule');
        expect(names).toContain('PortalStoreModule');
        expect(names).toContain('AiAnalyticsPortalModelModule');
    });

    it('конвейер собран: массив шагов непуст и содержит все 11 шагов в порядке STEP_ORDER', () => {
        const dynamic = pipelineDynamicModule();
        expect(dynamic.imports).toEqual(AI_ANALYTICS_PIPELINE_STEP_MODULES);
        const provider = (dynamic.providers ?? [])[0] as FactoryProvider<
            AiAnalyticsPipelineStep[]
        >;
        expect(provider.provide).toBe(AI_ANALYTICS_PIPELINE_STEPS);
        expect(provider.inject).toEqual(AI_ANALYTICS_PIPELINE_STEP_ORDER);
        expect(provider.inject).toHaveLength(11);
        const steps = AI_ANALYTICS_PIPELINE_STEP_ORDER.map(
            step => new (step as StepCtor)(),
        );
        const factory = provider.useFactory as (
            ...items: AiAnalyticsPipelineStep[]
        ) => AiAnalyticsPipelineStep[];
        expect(factory(...steps)).toHaveLength(11);
        expect(factory(...steps).map(step => step.code)).toEqual(
            steps.map(step => step.code),
        );
    });

    it('срезы процессора подключены: джоба резюме и раннер конвейера есть в графе', () => {
        const available = availableIn(AiAnalyticsModule, GLOBAL_PROVIDERS);
        expect(available.has(BriefJobUseCase)).toBe(true);
        const exportedTokens =
            (Reflect.getMetadata('exports', AiAnalyticsPipelineModule) as
                | unknown[]
                | undefined) ?? [];
        expect(exportedTokens).toContain(AI_ANALYTICS_SNAPSHOT_RUNNER);
    });

    it('ядро отдаёт наружу ровно свои провайдеры и не тянет PBXModule', () => {
        expect([...exportsOf(AiAnalyticsCoreModule)]).toEqual(
            AI_ANALYTICS_CORE_PROVIDERS,
        );
        expect([...exportsOf(AiAnalyticsCorePbxModule)]).toEqual(
            AI_ANALYTICS_CORE_PBX_PROVIDERS,
        );
        expect(importsDeep(AiAnalyticsCoreModule)).not.toContain(PBXModule);
        expect(importsOf(AiAnalyticsCoreModule)).not.toContain(PBXModule);
        expect(importsOf(AiAnalyticsCorePbxModule)).toContain(PBXModule);
    });

    it('общие провайдеры объявлены один раз: дублей между модулями фичи нет', () => {
        const owners = new Map<string, string[]>();
        for (const module of FEATURE_MODULES) {
            for (const provider of metadataList(module, 'providers')) {
                owners.set(provider.name, [
                    ...(owners.get(provider.name) ?? []),
                    module.name,
                ]);
            }
        }
        const duplicated = [...owners.entries()]
            .filter(([, modules]) => modules.length > 1)
            .map(([provider, modules]) => `${provider}: ${modules.join(', ')}`);
        expect(duplicated).toEqual([]);
    });
});
