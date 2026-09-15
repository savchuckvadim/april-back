import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_BRIEF_LIMITS,
    trimEvidencePack,
} from '@lib/sales-ai-analytics';
import { EvidencePackBuilder } from '../brief/evidence-pack.builder';
import { buildOverviewKey, buildPulseKey } from '../cache/cache-key.util';
import {
    AI_BRIEF_ATTENTION_LEAKS_TITLE,
    AI_BRIEF_FACT_CODES,
    AI_BRIEF_FACT_SPECS,
    AI_BRIEF_SNAPSHOT_LIMIT,
} from '../constants/ai-brief.const';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { FinanceLoader } from '../domain/loaders/finance.loader';
import { KpiLoader } from '../domain/loaders/kpi.loader';
import { ManagersLoader } from '../domain/loaders/managers.loader';
import { isoWeekKey } from '../domain/loaders/period.util';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import { BriefUseCase } from '../domain/use-cases/brief.use-case';
import {
    BRIEF_DOMAIN,
    BRIEF_FROM,
    BRIEF_NOW,
    BRIEF_PULSE_DAY,
    BRIEF_TO,
    forecastRow,
    modelRecord,
    monthRow,
    weekRow,
} from './fixtures/brief.fixture';
import { dependenciesOf } from './fixtures/module-di.util';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';
import { overviewFixture, twoManagersRows } from './fixtures/overview.fixture';

const MANAGERS = [10, 20];

interface Harness {
    /** Значения кэша по ключам (промах — ключа нет). */
    cached?: Record<string, unknown>;
    weeks?: ReturnType<typeof weekRow>[];
    months?: ReturnType<typeof monthRow>[];
    forecasts?: ReturnType<typeof forecastRow>[];
    model?: ReturnType<typeof modelRecord> | null;
    /** Ячейки эфирного времени из AppCache (по одной на менеджера). */
    airtime?: ({ airtimeSeconds: number } | null)[];
}

function makeBuilder({
    cached = {},
    weeks = [],
    months = [],
    forecasts = [],
    model = null,
    airtime = [null, null],
}: Harness) {
    const getJson = jest.fn(
        (key: string): Promise<unknown> => Promise.resolve(cached[key] ?? null),
    );
    const findByKeys = jest.fn(
        (_domain: string, type: string): Promise<unknown[]> => {
            if (type === AI_ANALYTICS_SNAPSHOT_TYPE.forecast) {
                return Promise.resolve(forecasts);
            }

            return Promise.resolve(
                type === AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek ? weeks : [],
            );
        },
    );
    const findManagerMonths = jest.fn().mockResolvedValue(months);
    const latestModel = jest.fn().mockResolvedValue(model);
    const getMany = jest.fn().mockResolvedValue(airtime);
    const builder = new EvidencePackBuilder(
        { getJson } as never,
        { findByKeys, findManagerMonths, latestModel } as never,
        settingsLoaderWith({}),
        { getMany } as never,
    );

    return {
        builder,
        getJson,
        findByKeys,
        findManagerMonths,
        latestModel,
        getMany,
    };
}

const build = (harness: Harness, managerIds = MANAGERS) =>
    makeBuilder(harness).builder.build({
        domain: BRIEF_DOMAIN,
        from: BRIEF_FROM,
        to: BRIEF_TO,
        managerIds,
        now: BRIEF_NOW,
    });

const codesOf = (facts: readonly { code: string }[]): string[] =>
    facts.map(fact => fact.code);

describe('EvidencePackBuilder: пакет фактов резюме', () => {
    it('промах всех кэшей: пакет собирается из снапшотов, ≥ 3 факта', async () => {
        const pack = await build({
            weeks: [weekRow('10'), weekRow('20')],
            months: [monthRow('10'), monthRow('20')],
            forecasts: [forecastRow('10'), forecastRow('20')],
            model: modelRecord({ mode: 'forecast', warnings: ['no-holidays'] }),
        });

        expect(pack.facts.length).toBeGreaterThanOrEqual(3);
        expect(codesOf(pack.facts)).toEqual([
            AI_BRIEF_FACT_CODES.alerts,
            AI_BRIEF_FACT_CODES.attention,
            AI_BRIEF_FACT_CODES.funnelGap,
            AI_BRIEF_FACT_CODES.planVsFactSales,
            AI_BRIEF_FACT_CODES.pipelineFromStage,
            AI_BRIEF_FACT_CODES.forecastP50,
            AI_BRIEF_FACT_CODES.disciplineNextStep,
            AI_BRIEF_FACT_CODES.callsOverThreshold,
            AI_BRIEF_FACT_CODES.dataQuality,
        ]);
        // Числа фактов — из снапшотов: 2 менеджера × 1 флаг, 2 × 2 утечки,
        // продажи 4 + 4 против плана 6 + 6, звонки 30 + 30.
        const byCode = new Map(pack.facts.map(fact => [fact.code, fact]));
        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)?.value).toBe(2);
        expect(byCode.get(AI_BRIEF_FACT_CODES.attention)?.value).toBe(4);
        // Запасной источник «Внимания» — утечки прогноза, и подпись факта
        // говорит именно о них: резюме не называет их карточками вкладки.
        expect(byCode.get(AI_BRIEF_FACT_CODES.attention)?.text).toBe(
            `${AI_BRIEF_ATTENTION_LEAKS_TITLE}: 4`,
        );
        expect(byCode.get(AI_BRIEF_FACT_CODES.planVsFactSales)?.text).toBe(
            'Продаж закрыто: 8 из 12',
        );
        expect(byCode.get(AI_BRIEF_FACT_CODES.callsOverThreshold)?.value).toBe(
            60,
        );
        // Разрыв к норме из снапшотов: 12/100 − 0,2 = −0,08.
        expect(byCode.get(AI_BRIEF_FACT_CODES.funnelGap)?.value).toBeCloseTo(
            -0.08,
            10,
        );
        // Дисциплина при промахе пульса — из чек-листов недели: 50 % → 0,5.
        expect(
            byCode.get(AI_BRIEF_FACT_CODES.disciplineNextStep)?.value,
        ).toBeCloseTo(0.5, 10);
    });

    it('снапшоты читаются только по ключам периодов, окно created_at не сканируется', async () => {
        const harness = makeBuilder({
            weeks: [weekRow('10')],
            months: [monthRow('10')],
            forecasts: [forecastRow('10')],
            model: modelRecord({}),
        });
        await harness.builder.build({
            domain: BRIEF_DOMAIN,
            from: BRIEF_FROM,
            to: BRIEF_TO,
            managerIds: MANAGERS,
            now: BRIEF_NOW,
        });

        expect(harness.latestModel).toHaveBeenCalledWith(
            BRIEF_DOMAIN,
            '2026-09',
        );
        expect(harness.findManagerMonths).toHaveBeenCalledWith(
            BRIEF_DOMAIN,
            ['2026-09'],
            { limit: AI_BRIEF_SNAPSHOT_LIMIT, managerIds: ['10', '20'] },
        );
        expect(harness.findByKeys).toHaveBeenCalledWith(
            BRIEF_DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
            {
                periodKeys: [BRIEF_TO],
                latestOnly: true,
                managerIds: ['10', '20'],
            },
        );
        expect(harness.findByKeys).toHaveBeenCalledWith(
            BRIEF_DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            {
                periodKeys: [isoWeekKey(BRIEF_TO)],
                latestOnly: true,
                managerIds: ['10', '20'],
            },
        );
    });

    it('кэш пульса и обзора имеют приоритет над снапшотами', async () => {
        const overview = overviewFixture(twoManagersRows(), MANAGERS);
        const pulse = {
            alerts: [
                { managerId: '10', transcriptionId: '1', kind: 'promise' },
                { managerId: '30', transcriptionId: '2', kind: 'urgent' },
            ],
            nextStepDateRate: { value: 0.9, n: 40 },
        };
        const harness = makeBuilder({
            cached: {
                [buildPulseKey(BRIEF_DOMAIN, BRIEF_PULSE_DAY)]: pulse,
                [buildOverviewKey(
                    BRIEF_DOMAIN,
                    BRIEF_FROM,
                    BRIEF_TO,
                    '10_20',
                    false,
                )]: { status: 'ready', data: overview },
            },
            weeks: [weekRow('10')],
            months: [monthRow('10')],
        });
        const pack = await harness.builder.build({
            domain: BRIEF_DOMAIN,
            from: BRIEF_FROM,
            to: BRIEF_TO,
            managerIds: MANAGERS,
            now: BRIEF_NOW,
        });
        const byCode = new Map(pack.facts.map(fact => [fact.code, fact]));

        // Алерт менеджера 30 вне периметра пакета — в факт не попал.
        expect(byCode.get(AI_BRIEF_FACT_CODES.alerts)?.value).toBe(1);
        expect(byCode.get(AI_BRIEF_FACT_CODES.disciplineNextStep)?.value).toBe(
            0.9,
        );
        // Пульс попал в кэш — недельные снапшоты не читались вовсе.
        expect(
            harness.findByKeys.mock.calls.map(call => call[1]),
        ).not.toContain(AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek);
        // По кэшу обзора считаются МЕНЕДЖЕРЫ с сигналом (в строке лежит
        // старшая карточка), поэтому подпись факта — про менеджеров, а не
        // про карточки вкладки, и знаменатель — строки обзора.
        const attention = byCode.get(AI_BRIEF_FACT_CODES.attention);
        expect(AI_BRIEF_FACT_SPECS[AI_BRIEF_FACT_CODES.attention].title).toBe(
            'Менеджеров с сигналом «Внимание»',
        );
        expect(attention?.text).toBe(
            `Менеджеров с сигналом «Внимание»: ${attention?.value}`,
        );
        expect(attention?.n).toBe(overview.managers.length);
        expect(attention?.value).toBe(
            overview.managers.filter(row => row.signal !== null).length,
        );
    });

    it('без явного ростера кэш обзора и эфирного времени не читаются', async () => {
        const harness = makeBuilder({ months: [monthRow('10')] });
        await harness.builder.build({
            domain: BRIEF_DOMAIN,
            from: BRIEF_FROM,
            to: BRIEF_TO,
            managerIds: [],
            now: BRIEF_NOW,
        });

        expect(harness.getMany).not.toHaveBeenCalled();
        expect(harness.getJson).toHaveBeenCalledTimes(1);
        expect(harness.getJson).toHaveBeenCalledWith(
            buildPulseKey(BRIEF_DOMAIN, BRIEF_PULSE_DAY),
        );
    });

    it('эфирное время берётся из кэша модуля airtime по ячейкам месяца', async () => {
        const pack = await build({
            months: [monthRow('10')],
            airtime: [{ airtimeSeconds: 3600 }, { airtimeSeconds: 1800 }],
        });
        const airtime = pack.facts.find(
            fact => fact.code === AI_BRIEF_FACT_CODES.airtime,
        );

        expect(airtime?.value).toBe(5400);
        expect(airtime?.n).toBe(2);
    });

    it('forecast_p50 попадает в пакет только при готовности не ниже forecast', async () => {
        const below = await build({
            forecasts: [forecastRow('10')],
            model: modelRecord({ mode: 'norms' }),
        });
        const ready = await build({
            forecasts: [forecastRow('10')],
            model: modelRecord({ mode: 'forecast' }),
        });

        expect(codesOf(below.facts)).not.toContain(
            AI_BRIEF_FACT_CODES.forecastP50,
        );
        expect(codesOf(ready.facts)).toContain(AI_BRIEF_FACT_CODES.forecastP50);
    });

    it('при полном промахе источников факт пропускается, пакет может быть пуст', async () => {
        const pack = await build({});

        expect(pack.facts).toEqual([]);
        expect(pack.droppedCodes).toEqual([]);
    });

    it('обрезка идёт по приоритету видов и лимитам пакета', async () => {
        const pack = await build({
            weeks: [weekRow('10')],
            months: [monthRow('10')],
            forecasts: [forecastRow('10')],
            model: modelRecord({ mode: 'forecast', warnings: ['no-holidays'] }),
            airtime: [{ airtimeSeconds: 60 }],
        });
        expect(pack.facts.length).toBeLessThanOrEqual(
            AI_BRIEF_LIMITS.packFacts,
        );

        const trimmed = trimEvidencePack(pack.facts, { maxFacts: 3 });
        expect(codesOf(trimmed.facts)).toEqual([
            AI_BRIEF_FACT_CODES.alerts,
            AI_BRIEF_FACT_CODES.attention,
            AI_BRIEF_FACT_CODES.funnelGap,
        ]);
        expect(trimmed.droppedCodes).toContain(AI_BRIEF_FACT_CODES.dataQuality);

        const byBytes = trimEvidencePack(pack.facts, { maxBytes: 600 });
        expect(byBytes.facts.length).toBeLessThan(pack.facts.length);
        expect(codesOf(byBytes.facts)[0]).toBe(AI_BRIEF_FACT_CODES.alerts);
    });

    it('мок-гард: ни сборщик, ни use-case’ы резюме не зависят от Bitrix и транскрипций', () => {
        const heavy = [
            CallsLoader,
            KpiLoader,
            FinanceLoader,
            ManagersLoader,
        ].map(unit => unit.name);
        for (const unit of [
            EvidencePackBuilder,
            BriefUseCase,
            BriefJobUseCase,
        ]) {
            const names = dependenciesOf(unit).map(dep => dep.name);
            expect(names.filter(name => heavy.includes(name))).toEqual([]);
            expect(names).not.toContain('PBXService');
            expect(names).not.toContain('AiAnalyticsTranscriptionStore');
        }
    });
});
