import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    DEFAULT_WORK_CALENDAR,
    timestampLeakShare,
    type AiTargets,
    type StageSlaFact,
} from '@lib/sales-ai-analytics';
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { ruWorkCalendar } from '../domain/loaders/calendar.util';
import { createStepBus } from '../steps/step.types';
import {
    agreedSla,
    callFacts,
    levelFactOf,
    slaFacts,
} from '../steps/sanity.facts';
import {
    alertsRule,
    buildSanityReadiness,
    calendarRule,
    durationRule,
    exposureRule,
    slaRule,
    targetRule,
    timestampLeakRule,
} from '../steps/sanity.rules';
import { leakFactOf, monthFactsOf } from '../steps/sanity.sources';
import { SanityStep } from '../steps/sanity.step';
import {
    AI_SANITY_DATA_QUALITY,
    AI_SANITY_LIMITS,
    AI_SANITY_RULES,
    AI_SANITY_SKIP_REASONS,
    type AiSanityReport,
    type SanityCallFact,
    type SanityLeakFact,
    type SanityLevelFact,
} from '../steps/sanity.types';
import type { AiPipelineStepContext } from '../steps/step.types';

const DOMAIN = 'a.bitrix24.ru';
const NOW = new Date('2026-09-07T00:15:00Z');
const MIN_N = AI_SANITY_LIMITS.minObservations;
const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;

/** Цели портала: у middle цель задана, у остальных полос — нет. */
function targets(sales: number | null): AiTargets {
    const empty = { sales: null, presentationsMin: 0, coldPerDay: 0 };
    return {
        byLevel: {
            junior: empty,
            middle: { ...empty, sales },
            senior: empty,
        },
        overrides: {},
    };
}

/** n менеджер-месяцев полосы middle с одинаковым фактом продаж. */
const levelFacts = (count: number, sales: number): SanityLevelFact[] =>
    Array.from({ length: count }, () => ({ level: 'middle', sales }));

/** n звонков типа с заданной длительностью и признаком алерта. */
function calls(
    count: number,
    durationSec: number,
    options: { callType?: string; managerId?: string; alert?: boolean } = {},
): SanityCallFact[] {
    return Array.from({ length: count }, () => ({
        managerId: options.managerId ?? '10',
        callType: options.callType ?? 'presentation',
        durationSec,
        alert: options.alert ?? false,
    }));
}

const slaFact = (n: number, p50: number): StageSlaFact => ({
    p25: p50 - 4,
    p50,
    p90: p50 + 10,
    n,
});

/**
 * Плацебо-тест на n продажах, из которых leaked закрыты раньше
 * презентации: считает библиотека — правило должно повторить её флаг.
 */
function leakOf(n: number, leaked: number): SanityLeakFact {
    const sales = Array.from({ length: n }, (unused, index) => ({
        episodeKey: `D-${index}#0`,
        closedAt: '2026-06-10T10:00:00Z',
        lastPresentationAt:
            index < leaked ? '2026-06-12T10:00:00Z' : '2026-06-01T10:00:00Z',
        lastInvoiceAt: null,
    }));
    const fact = leakFactOf(timestampLeakShare(sales));
    if (fact === null) throw new Error('плацебо-тест библиотеки не разобран');
    return fact;
}

describe('Правило «цель против медианы факта полосы»', () => {
    it('цель втрое выше медианы факта — предупреждение', () => {
        const result = targetRule(targets(12), levelFacts(MIN_N, 4), MIN_N);

        expect(result.status).toBe('warning');
        expect(result.rule).toBe(AI_SANITY_RULES.target);
        expect(result.warnings[0]).toContain('Цель уровня middle — 12 продаж');
        expect(result.warnings[0]).toContain('медиана факта полосы 4');
    });

    it('цель рядом с медианой — вердикт «ok»', () => {
        const result = targetRule(targets(5), levelFacts(MIN_N, 4), MIN_N);

        expect(result.status).toBe('ok');
        expect(result.warnings).toEqual([]);
    });

    it('наблюдений меньше порога — правило пропущено с причиной', () => {
        const result = targetRule(targets(12), levelFacts(MIN_N - 1, 4), MIN_N);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_SANITY_SKIP_REASONS.targetFacts);
        expect(result.warnings).toEqual([]);
    });
});

describe('Правило «SLA против фактических квантилей»', () => {
    const agreed = { [STAGE.refine]: 14 };

    it('факт p50 больше договорённости — предупреждение с квантилями', () => {
        const result = slaRule(
            agreed,
            { [STAGE.refine]: slaFact(MIN_N + 4, 21) },
            MIN_N,
        );

        expect(result.status).toBe('warning');
        expect(result.warnings[0]).toContain(`SLA стадии ${STAGE.refine}`);
        expect(result.warnings[0]).toContain('p25 17 / p50 21 / p90 31');
    });

    it('факт укладывается в договорённость — «ok»', () => {
        const result = slaRule(
            agreed,
            { [STAGE.refine]: slaFact(MIN_N + 4, 10) },
            MIN_N,
        );

        expect(result.status).toBe('ok');
    });

    it('фактов сроков в шине нет — правило пропущено', () => {
        const result = slaRule(agreed, {}, MIN_N);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_SANITY_SKIP_REASONS.slaFacts);
    });

    it('закрытых эпизодов меньше порога — правило пропущено', () => {
        const result = slaRule(
            agreed,
            { [STAGE.refine]: slaFact(MIN_N - 1, 40) },
            MIN_N,
        );

        expect(result.status).toBe('skipped');
    });
});

describe('Правило «порог длительности против фактов типа»', () => {
    it('порог отрезает больше четверти звонков типа — предупреждение', () => {
        const rows = [...calls(5, 100), ...calls(5, 900)];

        const result = durationRule({ presentation: 300 }, rows, MIN_N);

        expect(result.status).toBe('warning');
        expect(result.warnings[0]).toContain('отрезает 50 % звонков типа');
        expect(result.warnings[0]).toContain('p10 100');
    });

    it('порог отрезает меньше четверти — «ok»', () => {
        const rows = [...calls(1, 100), ...calls(9, 900)];

        const result = durationRule({ presentation: 300 }, rows, MIN_N);

        expect(result.status).toBe('ok');
    });

    it('звонков типа меньше порога — правило пропущено', () => {
        const result = durationRule(
            { presentation: 300 },
            calls(MIN_N - 1, 100),
            MIN_N,
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_SANITY_SKIP_REASONS.durationFacts);
    });
});

describe('Правило «шум алертов»', () => {
    it('больше трёх алертов на менеджера за неделю — предупреждение', () => {
        const rows = [
            ...calls(4, 300, { alert: true, managerId: '10' }),
            ...calls(6, 300, { managerId: '20' }),
        ];

        const result = alertsRule(rows, MIN_N);

        expect(result.status).toBe('warning');
        expect(result.warnings[0]).toContain(
            'Менеджер 10: алертов за неделю 4',
        );
    });

    it('три алерта на менеджера — ещё не шум', () => {
        const rows = [
            ...calls(3, 300, { alert: true, managerId: '10' }),
            ...calls(6, 300, { managerId: '20' }),
        ];

        expect(alertsRule(rows, MIN_N).status).toBe('ok');
    });

    it('звонков за неделю меньше порога — правило пропущено', () => {
        const result = alertsRule(
            calls(MIN_N - 1, 300, { alert: true }),
            MIN_N,
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_SANITY_SKIP_REASONS.alertFacts);
    });
});

describe('Правило «календарь»', () => {
    it('на год праздников нет — предупреждение', () => {
        const result = calendarRule(
            { ...DEFAULT_WORK_CALENDAR, holidays: [] },
            '2026-09-07',
        );

        expect(result.status).toBe('warning');
        expect(result.warnings[0]).toContain('на 2026 год праздников нет');
    });

    it('производственный календарь РФ вопросов не вызывает', () => {
        expect(calendarRule(ruWorkCalendar(2026), '2026-09-07').status).toBe(
            'ok',
        );
    });
});

describe('Правило «менеджер-месяцы с прокси-отсутствиями»', () => {
    it('прокси-отсутствия найдены — предупреждение с менеджерами', () => {
        const result = exposureRule([
            { managerId: '10', daysSource: 'proxy' },
            { managerId: '20', daysSource: 'calendar' },
        ]);

        expect(result.status).toBe('warning');
        expect(result.warnings[0]).toContain(
            'Менеджер-месяцев с прокси-отсутствиями 1 (10)',
        );
    });

    it('все знаменатели по календарю — «ok»', () => {
        expect(
            exposureRule([{ managerId: '10', daysSource: 'calendar' }]).status,
        ).toBe('ok');
    });

    it('менеджер-месяцев в сторе нет — правило пропущено', () => {
        const result = exposureRule([]);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_SANITY_SKIP_REASONS.exposureFacts);
    });
});

describe('Правило «плацебо-тест меток времени»', () => {
    it('доля протечки выше порога — предупреждение с числами и порогом', () => {
        const fact = leakOf(MIN_N + 2, 2);

        const result = timestampLeakRule(fact, MIN_N);

        expect(fact.flagged).toBe(true);
        expect(result.status).toBe('warning');
        expect(result.rule).toBe(AI_SANITY_RULES.timestampLeak);
        expect(result.warnings[0]).toContain(
            `${fact.leaked} из ${fact.n} продаж`,
        );
        expect(result.warnings[0]).toContain(`${fact.sharePct} % при пороге`);
        expect(result.warnings[0]).toContain(
            `${Math.round(fact.maxPct * 100)} %`,
        );
    });

    it('протечек нет — «ok»', () => {
        const result = timestampLeakRule(leakOf(MIN_N, 0), MIN_N);

        expect(result.status).toBe('ok');
        expect(result.warnings).toEqual([]);
    });

    it('шаг истории стадий не отработал — правило пропущено', () => {
        const result = timestampLeakRule(null, MIN_N);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_SANITY_SKIP_REASONS.leakFacts);
    });

    it('продаж меньше порога — правило молчит даже при флаге библиотеки', () => {
        const fact = leakOf(MIN_N - 1, 3);

        expect(fact.flagged).toBe(true);
        expect(timestampLeakRule(fact, MIN_N).status).toBe('skipped');
    });
});

describe('Готовность по качеству данных (dq-гейт)', () => {
    it('предупреждение плацебо-теста — flagged, коды правил с предупреждениями рядом', () => {
        const leak = leakOf(MIN_N, 2);
        const rules = [
            timestampLeakRule(leak, MIN_N),
            targetRule(targets(12), levelFacts(MIN_N, 4), MIN_N),
            calendarRule(ruWorkCalendar(2026), '2026-09-07'),
        ];

        const readiness = buildSanityReadiness(rules, leak);

        expect(readiness.dataQuality).toBe(AI_SANITY_DATA_QUALITY.flagged);
        expect(readiness.timestampLeak).toEqual(leak);
        expect(readiness.warningRules).toEqual([
            AI_SANITY_RULES.timestampLeak,
            AI_SANITY_RULES.target,
        ]);
    });

    it('плацебо-тест в порядке — ok', () => {
        const leak = leakOf(MIN_N, 0);

        expect(
            buildSanityReadiness([timestampLeakRule(leak, MIN_N)], leak)
                .dataQuality,
        ).toBe(AI_SANITY_DATA_QUALITY.ok);
    });

    it('плацебо-тест пропущен — unknown, факт не теряется', () => {
        const leak = leakOf(MIN_N - 1, 1);

        const readiness = buildSanityReadiness(
            [timestampLeakRule(leak, MIN_N)],
            leak,
        );

        expect(readiness.dataQuality).toBe(AI_SANITY_DATA_QUALITY.unknown);
        expect(readiness.timestampLeak).toEqual(leak);
        expect(
            buildSanityReadiness([timestampLeakRule(null, MIN_N)], null),
        ).toEqual({
            dataQuality: AI_SANITY_DATA_QUALITY.unknown,
            timestampLeak: null,
            warningRules: [],
        });
    });
});

describe('Разбор шины, стора и настроек', () => {
    it('коды SLA настроек превращаются в стадии лестницы', () => {
        expect(
            agreedSla({ sla_refine_days: 14, kappa_star: 30 } as never),
        ).toEqual({ [STAGE.refine]: 14 });
    });

    it('строки звонков берутся из шины, чужая форма отбрасывается', () => {
        const rows = callFacts([
            {
                managerId: 10,
                callType: 'cold',
                durationSec: 120,
                riskFlags: ['no_next_step'],
                coachingPriority: null,
            },
            'мусор',
        ]);

        expect(rows).toEqual([
            {
                managerId: '10',
                callType: 'cold',
                durationSec: 120,
                alert: true,
            },
        ]);
    });

    it('приоритет коучинга urgent — тоже алерт', () => {
        const rows = callFacts([
            {
                managerId: '10',
                callType: 'cold',
                durationSec: 120,
                riskFlags: [],
                coachingPriority: 'urgent',
            },
        ]);

        expect(rows[0].alert).toBe(true);
    });

    it('факты сроков читаются из шины, чужая форма даёт пусто', () => {
        expect(slaFacts({ [STAGE.refine]: { p50: 12, n: 9 } })).toEqual({
            [STAGE.refine]: { p25: 0, p50: 12, p90: 0, n: 9 },
        });
        expect(slaFacts('мусор')).toEqual({});
    });

    it('плацебо-тест читается в форме писателя, чужая форма — null', () => {
        const written = timestampLeakShare([]);

        expect(leakFactOf(written)).toEqual({
            n: 0,
            leaked: 0,
            sharePct: 0,
            maxPct: written.maxPct,
            flagged: false,
        });
        expect(leakFactOf({ leaked: 1 })).toBeNull();
        expect(leakFactOf(undefined)).toBeNull();
    });

    it('уровни и экспозиция берутся из записей менеджер-месяцев одним проходом', () => {
        const facts = monthFactsOf([
            {
                managerId: '10',
                payload: {
                    level: 'middle',
                    finance: { salesCount: 4 },
                    exposure: { daysSource: 'proxy', dMt: 12 },
                },
            },
            {
                managerId: '20',
                payload: {
                    level: 'senior',
                    finance: { salesCount: 7 },
                    exposure: { daysSource: 'calendar', dMt: 21 },
                },
            },
            // Портальная запись без менеджера и нагрузка без экспозиции.
            { managerId: null, payload: { exposure: { daysSource: 'proxy' } } },
            { managerId: '30', payload: { level: 'middle' } },
        ]);

        expect(facts.levels).toEqual([
            { level: 'middle', sales: 4 },
            { level: 'senior', sales: 7 },
        ]);
        expect(facts.exposure).toEqual([
            { managerId: '10', daysSource: 'proxy' },
            { managerId: '20', daysSource: 'calendar' },
        ]);
        expect(levelFactOf({ level: 'middle' })).toEqual([]);
    });
});

/** Контекст прогона в объёме, который читает панель. */
function makeContext(
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext {
    return {
        domain: DOMAIN,
        rhythm: 'weekly',
        day: '2026-09-07',
        weekKey: '2026-W36',
        monthKey: '2026-09',
        timeZone: 'Europe/Moscow',
        calendar: ruWorkCalendar(2026),
        settings: {
            targets: targets(12),
            modelParams: { sla_refine_days: 14 },
            definitions: { minDurationSecByType: { presentation: 300 } },
        },
        registry: {},
        paramsVersion: 'pv-1',
        calcVersion: 'sam-1.0.0',
        comparableFrom: '',
        inputsHash: 'hash',
        managerIds: [10],
        now: NOW,
        forceRefresh: false,
        ...overrides,
    } as AiPipelineStepContext;
}

/**
 * Стор снапшотов глазами панели: записи менеджер-месяцев с уровнем,
 * продажами и экспозицией. Модель портала панель не читает и не пишет.
 */
function makeStore(daysSource = 'proxy') {
    const findByKeys = jest.fn().mockResolvedValue(
        levelFacts(MIN_N, 4).map(fact => ({
            managerId: '10',
            payload: {
                level: fact.level,
                finance: { salesCount: fact.sales },
                exposure: { daysSource },
            },
        })),
    );
    const latest = jest.fn().mockResolvedValue(null);
    const upsert = jest.fn().mockResolvedValue({ id: '2', supersededIds: [] });
    return { findByKeys, latest, upsert };
}

/** Шина после шагов звонков и истории стадий — в форме их писателей. */
function filledBus() {
    const bus = createStepBus();
    bus.set(
        AI_PIPELINE_BUS_KEYS.callsRows,
        calls(10, 100).map(row => ({ ...row, riskFlags: [] })),
    );
    bus.set(AI_PIPELINE_BUS_KEYS.slaFacts, {
        [STAGE.refine]: slaFact(12, 21),
    });
    bus.set(
        AI_PIPELINE_BUS_KEYS.timestampLeak,
        timestampLeakShare(
            Array.from({ length: MIN_N }, (unused, index) => ({
                episodeKey: `D-${index}#0`,
                closedAt: '2026-06-10T10:00:00Z',
                lastPresentationAt:
                    index < 2 ? '2026-06-12T10:00:00Z' : '2026-06-01T10:00:00Z',
                lastInvoiceAt: null,
            })),
        ),
    );
    return bus;
}

describe('SanityStep — шаг конвейера', () => {
    it('код и ритмы: неделя и месячная заморозка (отчёт забирает модель портала)', () => {
        const step = new SanityStep(makeStore() as never);

        expect(step.code).toBe('sanity');
        expect(step.rhythms).toEqual(['weekly', 'monthly']);
    });

    it('предупреждения уезжают в журнал прогона, отчёт — в шину, снапшоты не пишутся', async () => {
        const store = makeStore();
        const step = new SanityStep(store as never);
        const bus = filledBus();

        const result = await step.run(makeContext(), bus);

        expect(result.status).toBe('ok');
        expect(result.written).toBe(0);
        expect(result.rows).toBe(10);
        expect(result.warnings).toEqual(result.report.warnings);
        expect(store.upsert).not.toHaveBeenCalled();
        expect(store.latest).not.toHaveBeenCalled();
        const report = bus.get<AiSanityReport>(AI_PIPELINE_BUS_KEYS.sanity);
        expect(report).toBe(result.report);
        expect(report?.weekKey).toBe('2026-W36');
        expect(report?.rules).toHaveLength(7);
        expect(report?.rules.map(rule => [rule.rule, rule.status])).toEqual([
            [AI_SANITY_RULES.target, 'warning'],
            [AI_SANITY_RULES.sla, 'warning'],
            [AI_SANITY_RULES.duration, 'warning'],
            [AI_SANITY_RULES.alerts, 'ok'],
            [AI_SANITY_RULES.calendar, 'ok'],
            [AI_SANITY_RULES.exposure, 'warning'],
            [AI_SANITY_RULES.timestampLeak, 'warning'],
        ]);
        expect(report?.warnings).toHaveLength(5);
    });

    it('плацебо-тест доезжает до готовности отчёта (dq-гейт)', async () => {
        const step = new SanityStep(makeStore('calendar') as never);
        const bus = filledBus();

        const result = await step.run(makeContext(), bus);

        expect(result.report.readiness.dataQuality).toBe(
            AI_SANITY_DATA_QUALITY.flagged,
        );
        expect(result.report.readiness.timestampLeak).toEqual(
            leakFactOf(bus.get(AI_PIPELINE_BUS_KEYS.timestampLeak)),
        );
        expect(result.report.readiness.warningRules).not.toContain(
            AI_SANITY_RULES.exposure,
        );
    });

    it('шаг истории стадий пропущен — правила SLA и протечки молчат с причиной', async () => {
        const step = new SanityStep(makeStore() as never);

        const result = await step.run(makeContext(), createStepBus());

        const byRule = new Map(
            result.report.rules.map(rule => [rule.rule, rule]),
        );
        expect(byRule.get(AI_SANITY_RULES.sla)).toMatchObject({
            status: 'skipped',
            reason: AI_SANITY_SKIP_REASONS.slaFacts,
        });
        expect(byRule.get(AI_SANITY_RULES.timestampLeak)).toMatchObject({
            status: 'skipped',
            reason: AI_SANITY_SKIP_REASONS.leakFacts,
        });
        expect(result.report.readiness.dataQuality).toBe(
            AI_SANITY_DATA_QUALITY.unknown,
        );
    });

    it('фактов нет и календарь в порядке — шаг пропущен с причиной, отчёт всё равно в шине', async () => {
        const store = makeStore();
        store.findByKeys.mockResolvedValue([]);
        const step = new SanityStep(store as never);
        const bus = createStepBus();

        const result = await step.run(
            makeContext({
                settings: {
                    targets: targets(null),
                    modelParams: {},
                    definitions: { minDurationSecByType: {} },
                } as never,
            }),
            bus,
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_SANITY_SKIP_REASONS.noData);
        expect(result.warnings).toEqual([]);
        expect(bus.get(AI_PIPELINE_BUS_KEYS.sanity)).toBe(result.report);
    });

    it('месяцы фактов берутся до месяца прогона одним чтением стора', async () => {
        const store = makeStore();
        const step = new SanityStep(store as never);

        await step.run(makeContext(), createStepBus());

        expect(store.findByKeys).toHaveBeenCalledTimes(1);
        expect(store.findByKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: ['2026-08', '2026-07', '2026-06'] },
        );
    });
});

/**
 * Единый порог длительности разбора (решение владельца А.1, P2-56): пульс
 * и конвейер обязаны считать «разбираемым» один и тот же звонок, поэтому
 * панель берёт порог тем же правилом `minDurationSecOf` — карта портала,
 * потом ключ «все прочие типы», потом дефолт реестра.
 */
describe('Порог длительности: один источник у пульса и конвейера', () => {
    it('тип без своего порога проверяется значением «все прочие»', () => {
        const rows = [
            ...calls(5, 30, { callType: 'cold' }),
            ...calls(5, 900, { callType: 'cold' }),
        ];

        const result = durationRule({ default: 60 }, rows, MIN_N);

        expect(result.status).toBe('warning');
        expect(result.warnings[0]).toContain('Порог длительности типа cold');
        expect(result.warnings[0]).toContain('(60 с)');
    });

    it('без карты и без реестра порог прежний — 300 с Фазы 1a', () => {
        const rows = [...calls(6, 100), ...calls(4, 900)];

        const result = durationRule({}, rows, MIN_N);

        expect(result.status).toBe('warning');
        expect(result.warnings[0]).toContain('(300 с)');
    });

    it('значение реестра портала доезжает до правила панели', async () => {
        const step = new SanityStep(makeStore() as never);
        const bus = createStepBus();
        bus.set(
            AI_PIPELINE_BUS_KEYS.callsRows,
            [...calls(6, 100), ...calls(4, 900)].map(row => ({
                ...row,
                riskFlags: [],
            })),
        );

        const result = await step.run(
            makeContext({
                registry: { portal: { min_duration_sec_by_type: 60 } },
            }),
            bus,
        );

        const duration = result.report.rules.find(
            rule => rule.rule === AI_SANITY_RULES.duration,
        );
        expect(duration?.status).toBe('ok');
        expect(result.report.warnings.join(' ')).not.toContain(
            'Порог длительности',
        );
    });
});
