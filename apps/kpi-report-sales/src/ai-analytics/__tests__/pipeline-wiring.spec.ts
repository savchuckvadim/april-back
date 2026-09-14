import 'reflect-metadata';
import type { FactoryProvider, Type } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import {
    AI_PIPELINE_RHYTHMS,
    type AiPipelineRhythm,
} from '../constants/ai-snapshot.const';
import { AiAnalyticsPassportModule } from '../passport/ai-analytics-passport.module';
import {
    AI_ANALYTICS_PIPELINE_STEP_MODULES,
    AI_ANALYTICS_PIPELINE_STEP_ORDER,
    AiAnalyticsPipelineModule,
} from '../pipeline/ai-analytics-pipeline.module';
import { AiAnalyticsRopMarkModule } from '../rop-mark/ai-analytics-rop-mark.module';
import { AiAnalyticsSnapshotsModule } from '../snapshots/ai-analytics-snapshots.module';
import { AiAnalyticsStageHistoryModule } from '../stage-history/ai-analytics-stage-history.module';
import {
    AI_ANALYTICS_PIPELINE_STEPS,
    type AiAnalyticsPipelineStep,
} from '../steps/step.types';
import {
    exportsOf,
    metadataList,
    missingDependencies,
    type Ctor,
} from './fixtures/module-di.util';

/**
 * Сборка ночного конвейера Фазы 2 (волна 4). Проверяется то, чего не
 * видно в тесте отдельного шага: срезы закрывают свои зависимости сами,
 * все шаги достижимы в графе конвейера, порядок массива согласован с
 * шиной значений, и каждый ритм — включая догон истории — действительно
 * выполняет шаги (приёмка волны 3 зафиксировала обратное: у `backfill`
 * не было ни одного шага, потому что шаги ещё не были зарегистрированы).
 *
 * Сам фильтр раннера (`steps.filter(step.rhythms.includes(rhythm))` плюс
 * белый список джобы) покрыт `snapshot-pipeline.service.spec.ts`; здесь
 * проверяется состав массива, который в этот фильтр приходит.
 */

/** Шаг конструируется без зависимостей: код и ритмы — поля экземпляра. */
type StepCtor = new (...args: never[]) => AiAnalyticsPipelineStep;

const STEPS: AiAnalyticsPipelineStep[] = AI_ANALYTICS_PIPELINE_STEP_ORDER.map(
    step => new (step as StepCtor)(),
);

const CODES = STEPS.map(step => step.code);

function codesOfRhythm(rhythm: AiPipelineRhythm): string[] {
    return STEPS.filter(step => step.rhythms.includes(rhythm)).map(
        step => step.code,
    );
}

function indexOfCode(code: string): number {
    return CODES.indexOf(code);
}

const SLICE_MODULES: Ctor[] = [
    AiAnalyticsSnapshotsModule,
    AiAnalyticsPassportModule,
    AiAnalyticsStageHistoryModule,
    AiAnalyticsRopMarkModule,
];

describe('Срезы шагов конвейера (волна 4)', () => {
    it.each(SLICE_MODULES)(
        '%p: зависимости провайдеров доступны в модуле',
        module => {
            expect(missingDependencies(module, [AppCacheService])).toEqual([]);
        },
    );

    it.each(SLICE_MODULES)(
        '%p: срез не публикует контроллеров — поверхность API не растёт',
        module => {
            expect(metadataList(module, 'controllers')).toEqual([]);
            const leaking = metadataList(module, 'imports')
                .filter(imported => imported.name !== 'BxDepartmentModule')
                .filter(
                    imported =>
                        metadataList(imported, 'controllers').length > 0,
                )
                .map(imported => imported.name);
            expect(leaking).toEqual([]);
        },
    );

    it('модули сборки — ровно те срезы, что экспортируют шаги', () => {
        expect(AI_ANALYTICS_PIPELINE_STEP_MODULES).toEqual(SLICE_MODULES);
    });
});

describe('Порядок шагов ночного конвейера', () => {
    it('коды шагов уникальны', () => {
        expect(new Set(CODES).size).toBe(CODES.length);
    });

    it('порядок соответствует зависимостям по шине', () => {
        expect(CODES).toEqual([
            'calls',
            'passport',
            'stage-history',
            'kpi',
            'style',
            'plans',
            'finance',
            'rop-mark',
            'sanity',
        ]);
    });

    // Читатель ключа шины обязан идти после писателя: прямых зависимостей
    // между шагами нет, порядок массива — единственная гарантия.
    it.each([
        ['calls', 'passport'],
        ['calls', 'stage-history'],
        ['calls', 'style'],
        ['calls', 'rop-mark'],
        ['calls', 'sanity'],
        ['passport', 'style'],
        ['passport', 'finance'],
        ['stage-history', 'finance'],
        ['stage-history', 'sanity'],
        ['kpi', 'finance'],
        ['style', 'finance'],
        ['plans', 'finance'],
    ])('шаг «%s» идёт раньше читающего его «%s»', (writer, reader) => {
        expect(indexOfCode(writer)).toBeGreaterThanOrEqual(0);
        expect(indexOfCode(writer)).toBeLessThan(indexOfCode(reader));
    });

    it('каждый шаг достижим в графе: провайдер конвейера или экспорт среза', () => {
        const available = new Set<unknown>(
            metadataList(AiAnalyticsPipelineModule, 'providers'),
        );
        for (const module of SLICE_MODULES) {
            for (const exported of exportsOf(module)) available.add(exported);
        }
        const unreachable = AI_ANALYTICS_PIPELINE_STEP_ORDER.filter(
            step => !available.has(step),
        ).map(step => step.name);
        expect(unreachable).toEqual([]);
    });
});

describe('Ритмы прогона', () => {
    it.each(AI_PIPELINE_RHYTHMS)(
        'ритм «%s» выполняет хотя бы один шаг',
        rhythm => {
            expect(codesOfRhythm(rhythm).length).toBeGreaterThan(0);
        },
    );

    it('догон истории считает месяцы с паспортом из кэша, но без снимка планов', () => {
        // Паспорт нужен и в догоне: без него у догнанных месяцев
        // `tenureBand: null`, и полосы стажа не собираются. В этом ритме он
        // берётся из кэша `user.get`, в портал за ним не ходим.
        expect(codesOfRhythm('backfill')).toEqual([
            'calls',
            'passport',
            'stage-history',
            'kpi',
            'finance',
        ]);
        expect(codesOfRhythm('backfill')).not.toContain('plans');
    });

    it('ночной ритм: разборы, паспорт, эпизоды, KPI и финансы', () => {
        expect(codesOfRhythm('nightly')).toEqual([
            'calls',
            'passport',
            'stage-history',
            'kpi',
            'finance',
        ]);
    });

    it('недельный ритм: три звонка недели есть, санити-панель последняя', () => {
        // История стадий идёт и в недельном ритме: санити-панель читает из
        // шины `slaFacts` и метки времени, которые пишет только этот шаг —
        // без него два правила панели из шести молчали бы в проде.
        const weekly = codesOfRhythm('weekly');
        expect(weekly).toEqual([
            'calls',
            'passport',
            'stage-history',
            'rop-mark',
            'sanity',
        ]);
        expect(weekly[weekly.length - 1]).toBe('sanity');
    });

    it('месячный ритм: стиль и снимок планов есть, финансы закрывают месяц', () => {
        const monthly = codesOfRhythm('monthly');
        // Санити-панель идёт и в месяце: её структурный отчёт забирает
        // модель портала (`portal-model.sanity`), а модель считается по
        // закрытому месяцу — иначе в модель попадала бы панель за другой
        // период либо не попадала вовсе.
        expect(monthly).toEqual([
            'calls',
            'passport',
            'stage-history',
            'kpi',
            'style',
            'plans',
            'finance',
            'sanity',
        ]);
        expect(monthly.indexOf('finance')).toBeGreaterThan(
            monthly.indexOf('kpi'),
        );
        expect(monthly[monthly.length - 1]).toBe('sanity');
    });
});

describe('AiAnalyticsPipelineModule.registerPhase2', () => {
    const dynamic = AiAnalyticsPipelineModule.registerPhase2();
    const provider = (dynamic.providers ?? [])[0] as FactoryProvider<
        AiAnalyticsPipelineStep[]
    >;

    it('подключает модули срезов и собирает шаги в порядке массива', () => {
        expect(dynamic.module).toBe(AiAnalyticsPipelineModule);
        expect(dynamic.imports).toEqual(AI_ANALYTICS_PIPELINE_STEP_MODULES);
        expect(provider.provide).toBe(AI_ANALYTICS_PIPELINE_STEPS);
        expect(provider.inject).toEqual(AI_ANALYTICS_PIPELINE_STEP_ORDER);
    });

    it('фабрика отдаёт шаги в том же порядке, в каком их инжектит Nest', () => {
        const factory = provider.useFactory as (
            ...steps: AiAnalyticsPipelineStep[]
        ) => AiAnalyticsPipelineStep[];
        expect(factory(...STEPS).map(step => step.code)).toEqual(CODES);
    });

    it('шаги — классы: массив типизирован Type<AiAnalyticsPipelineStep>', () => {
        const steps: Type<AiAnalyticsPipelineStep>[] =
            AI_ANALYTICS_PIPELINE_STEP_ORDER;
        expect(steps.every(step => typeof step === 'function')).toBe(true);
    });
});
