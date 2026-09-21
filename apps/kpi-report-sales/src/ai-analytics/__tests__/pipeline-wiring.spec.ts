import 'reflect-metadata';
import type { FactoryProvider, Type } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { AiAnalyticsRopMarkController } from '../ai-analytics-rop-mark.controller';
import {
    AI_CALLS_STEP_RHYTHMS,
    AI_FINANCE_STEP_RHYTHMS,
    AI_KPI_STEP_RHYTHMS,
    AI_STYLE_STEP_RHYTHMS,
} from '../constants/ai-manager-snapshot.const';
import { AI_PASSPORT_STEP_RHYTHMS } from '../constants/ai-passport.const';
import {
    AI_FORECAST_RHYTHMS,
    AI_FORECAST_STEP_CODE,
    AI_PORTAL_MODEL_RHYTHMS,
    AI_PORTAL_MODEL_STEP_CODE,
} from '../constants/ai-portal-model.const';
import {
    AI_ROP_MARK_STEP_CODE,
    AI_ROP_MARK_STEP_RHYTHMS,
} from '../constants/ai-rop-mark.const';
import {
    AI_PIPELINE_RHYTHMS,
    type AiPipelineRhythm,
} from '../constants/ai-snapshot.const';
import { AI_STAGE_HISTORY_RHYTHMS } from '../constants/ai-stage-history.const';
import { AiAnalyticsPassportModule } from '../passport/ai-analytics-passport.module';
import {
    AI_ANALYTICS_PIPELINE_STEP_MODULES,
    AI_ANALYTICS_PIPELINE_STEP_ORDER,
    AiAnalyticsPipelineModule,
} from '../pipeline/ai-analytics-pipeline.module';
import { AiAnalyticsPortalModelModule } from '../portal-model/ai-analytics-portal-model.module';
import { AiAnalyticsRopMarkModule } from '../rop-mark/ai-analytics-rop-mark.module';
import { AiAnalyticsSnapshotsModule } from '../snapshots/ai-analytics-snapshots.module';
import { AiAnalyticsStageHistoryModule } from '../stage-history/ai-analytics-stage-history.module';
import { CallsStep } from '../steps/calls.step';
import { FinanceStep } from '../steps/finance.step';
import { ForecastStep } from '../steps/forecast.step';
import { KpiStep } from '../steps/kpi.step';
import { PassportStep } from '../steps/passport.step';
import { AI_PLANS_STEP_RHYTHMS, PlansStep } from '../steps/plans.step';
import { PortalModelStep } from '../steps/portal-model.step';
import { RopMarkStep } from '../steps/rop-mark.step';
import { SanityStep } from '../steps/sanity.step';
import {
    AI_SANITY_STEP_CODE,
    AI_SANITY_STEP_RHYTHMS,
} from '../steps/sanity.types';
import { StageHistoryStep } from '../steps/stage-history.step';
import {
    AI_ANALYTICS_PIPELINE_STEPS,
    type AiAnalyticsPipelineStep,
} from '../steps/step.types';
import { StyleStep } from '../steps/style.step';
import {
    exportsOf,
    metadataList,
    missingDependencies,
    type Ctor,
} from './fixtures/module-di.util';

/**
 * Сборка ночного конвейера Фазы 2 (волна 4 + поток 19). Проверяется то,
 * чего не видно в тесте отдельного шага: срезы закрывают свои зависимости
 * сами, все шаги достижимы в графе конвейера, порядок массива согласован
 * с шиной значений, и каждый ритм — включая догон истории — действительно
 * выполняет шаги (приёмка волны 3 зафиксировала обратное: у `backfill`
 * не было ни одного шага, потому что шаги ещё не были зарегистрированы).
 *
 * Ожидания по ритмам НЕ вписаны руками: они выводятся из констант
 * `AI_*_RHYTHMS` срезов (источник ритма каждого шага) и порядка массива.
 * Руками закреплены только решения о порядке внутри ритма (кто за кем).
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

/**
 * Ритмы каждого шага по константам его среза — второй, независимый от
 * экземпляра источник: если у шага поменяют поле `rhythms`, не тронув
 * константу (или наоборот), спек это увидит.
 */
const RHYTHMS_BY_STEP = new Map<
    Type<AiAnalyticsPipelineStep>,
    readonly AiPipelineRhythm[]
>([
    [CallsStep, AI_CALLS_STEP_RHYTHMS],
    [PassportStep, AI_PASSPORT_STEP_RHYTHMS],
    [StageHistoryStep, AI_STAGE_HISTORY_RHYTHMS],
    [KpiStep, AI_KPI_STEP_RHYTHMS],
    [StyleStep, AI_STYLE_STEP_RHYTHMS],
    [PlansStep, AI_PLANS_STEP_RHYTHMS],
    [FinanceStep, AI_FINANCE_STEP_RHYTHMS],
    [RopMarkStep, AI_ROP_MARK_STEP_RHYTHMS],
    [SanityStep, AI_SANITY_STEP_RHYTHMS],
    [PortalModelStep, AI_PORTAL_MODEL_RHYTHMS],
    [ForecastStep, AI_FORECAST_RHYTHMS],
]);

/** Коды шагов ритма по константам срезов в порядке массива. */
function expectedCodesOfRhythm(rhythm: AiPipelineRhythm): string[] {
    return AI_ANALYTICS_PIPELINE_STEP_ORDER.filter(step =>
        (RHYTHMS_BY_STEP.get(step) ?? []).includes(rhythm),
    ).map(step => new (step as StepCtor)().code);
}

/** Коды шагов ритма по полю `rhythms` экземпляров (как фильтрует раннер). */
function codesOfRhythm(rhythm: AiPipelineRhythm): string[] {
    return STEPS.filter(step => step.rhythms.includes(rhythm)).map(
        step => step.code,
    );
}

function indexOfCode(code: string): number {
    return CODES.indexOf(code);
}

function last(codes: readonly string[]): string | undefined {
    return codes[codes.length - 1];
}

const SLICE_MODULES: Ctor[] = [
    AiAnalyticsSnapshotsModule,
    AiAnalyticsPassportModule,
    AiAnalyticsStageHistoryModule,
    AiAnalyticsRopMarkModule,
    AiAnalyticsPortalModelModule,
];

/** Единственный срез шагов с ручками — слепая проверка руководителя. */
const SLICE_CONTROLLERS = new Map<Ctor, Ctor[]>([
    [AiAnalyticsRopMarkModule, [AiAnalyticsRopMarkController]],
]);

describe('Срезы шагов конвейера', () => {
    it.each(SLICE_MODULES)(
        '%p: зависимости провайдеров доступны в модуле',
        module => {
            expect(missingDependencies(module, [AppCacheService])).toEqual([]);
        },
    );

    it.each(SLICE_MODULES)(
        '%p: срез публикует только свои ручки — чужие контроллеры не текут',
        module => {
            expect(metadataList(module, 'controllers')).toEqual(
                SLICE_CONTROLLERS.get(module) ?? [],
            );
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
    it('одиннадцать шагов с уникальными кодами, у каждого известны ритмы', () => {
        expect(CODES).toHaveLength(11);
        expect(new Set(CODES).size).toBe(CODES.length);
        expect(
            AI_ANALYTICS_PIPELINE_STEP_ORDER.filter(
                step => !RHYTHMS_BY_STEP.has(step),
            ),
        ).toEqual([]);
        expect(RHYTHMS_BY_STEP.size).toBe(
            AI_ANALYTICS_PIPELINE_STEP_ORDER.length,
        );
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
            AI_ROP_MARK_STEP_CODE,
            AI_SANITY_STEP_CODE,
            AI_PORTAL_MODEL_STEP_CODE,
            AI_FORECAST_STEP_CODE,
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
        ['calls', 'portal-model'],
        ['calls', 'forecast'],
        ['passport', 'style'],
        ['passport', 'finance'],
        ['passport', 'portal-model'],
        ['stage-history', 'finance'],
        ['stage-history', 'sanity'],
        ['stage-history', 'portal-model'],
        ['stage-history', 'forecast'],
        ['kpi', 'finance'],
        ['style', 'finance'],
        ['plans', 'finance'],
        ['sanity', 'portal-model'],
        ['portal-model', 'forecast'],
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
        'ритм «%s»: состав шагов выводится из констант срезов и непуст',
        rhythm => {
            const codes = codesOfRhythm(rhythm);
            expect(codes.length).toBeGreaterThan(0);
            expect(codes).toEqual(expectedCodesOfRhythm(rhythm));
        },
    );

    it('догон истории: паспорт из кэша, без снимка планов, модель портала пересчитывается последней', () => {
        // Паспорт нужен и в догоне: без него у догнанных месяцев
        // `tenureBand: null`, и полосы стажа не собираются. В этом ритме он
        // берётся из кэша `user.get`, в портал за ним не ходим. Модель
        // портала считается по догнанным месяцам, поэтому идёт после
        // финансов; прогноз про сегодняшний остаток месяца в догоне не нужен.
        const backfill = codesOfRhythm('backfill');
        expect(backfill).toContain('passport');
        expect(backfill).not.toContain('plans');
        expect(backfill).not.toContain(AI_FORECAST_STEP_CODE);
        expect(backfill).toContain(AI_PORTAL_MODEL_STEP_CODE);
        expect(last(backfill)).toBe(AI_PORTAL_MODEL_STEP_CODE);
        expect(backfill.indexOf('finance')).toBeLessThan(
            backfill.indexOf(AI_PORTAL_MODEL_STEP_CODE),
        );
    });

    it('ночной ритм: прогноз последний, модель портала каждую ночь не пересчитывается', () => {
        const nightly = codesOfRhythm('nightly');
        expect(nightly).toContain(AI_FORECAST_STEP_CODE);
        expect(last(nightly)).toBe(AI_FORECAST_STEP_CODE);
        expect(nightly).not.toContain(AI_PORTAL_MODEL_STEP_CODE);
        expect(nightly).not.toContain(AI_SANITY_STEP_CODE);
        expect(nightly.indexOf('stage-history')).toBeLessThan(
            nightly.indexOf(AI_FORECAST_STEP_CODE),
        );
    });

    it('недельный ритм: три звонка недели есть, санити-панель последняя', () => {
        // История стадий идёт и в недельном ритме: санити-панель читает из
        // шины `slaFacts` и метки времени, которые пишет только этот шаг —
        // без него два правила панели из шести молчали бы в проде.
        const weekly = codesOfRhythm('weekly');
        expect(weekly).toContain('stage-history');
        expect(weekly).toContain(AI_ROP_MARK_STEP_CODE);
        expect(last(weekly)).toBe(AI_SANITY_STEP_CODE);
        expect(weekly).not.toContain(AI_PORTAL_MODEL_STEP_CODE);
        expect(weekly).not.toContain(AI_FORECAST_STEP_CODE);
    });

    it('месячный ритм: финансы закрывают месяц, панель перед моделью, модель портала последняя', () => {
        // Санити-панель идёт и в месяце: её структурный отчёт забирает
        // модель портала (`portal-model.sanity`) из шины ТОГО ЖЕ прогона,
        // а модель считается по закрытому месяцу — значит после финансов.
        const monthly = codesOfRhythm('monthly');
        expect(monthly).toContain('style');
        expect(monthly).toContain('plans');
        expect(monthly.indexOf('finance')).toBeGreaterThan(
            monthly.indexOf('kpi'),
        );
        expect(monthly.indexOf(AI_SANITY_STEP_CODE)).toBeGreaterThan(
            monthly.indexOf('finance'),
        );
        expect(monthly.indexOf(AI_PORTAL_MODEL_STEP_CODE)).toBeGreaterThan(
            monthly.indexOf(AI_SANITY_STEP_CODE),
        );
        expect(last(monthly)).toBe(AI_PORTAL_MODEL_STEP_CODE);
        expect(monthly).not.toContain(AI_FORECAST_STEP_CODE);
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
