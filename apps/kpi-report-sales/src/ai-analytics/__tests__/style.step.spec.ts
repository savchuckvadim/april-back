import 'reflect-metadata';
import type {
    AnalyticsLiteDataset,
    CallReportAnalyticsQueryDto,
} from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import type { SnapshotEnvelope } from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import type { ManagerStylePayload } from '../domain/assembler/manager-snapshot.types';
import {
    axesOf,
    buildStyleRows,
} from '../domain/assembler/manager-style.assembler';
import type { StyleCrmLoader } from '../domain/loaders/style-crm.loader';
import type {
    StyleCrmManagerMonth,
    StyleCrmResult,
    StyleCrmUnits,
} from '../domain/loaders/style-crm.types';
import { byCallType } from '../domain/loaders/style-crm.units';
import {
    AI_STYLE_CRM_UNAVAILABLE_REASON,
    StyleStep,
    styleCrmThresholdsOf,
    tenureBandsOf,
} from '../steps/style.step';
import { createStepBus } from '../steps/step.types';
import type { StepBus } from '../steps/step.types';
import type { AiAnalyticsSnapshotUpsertResult } from '../store/ai-analytics-snapshot.store';
import { callsLoaderWith, liteRow } from './fixtures/lite-row.fixture';
import {
    snapshotStoreMock,
    stepContext,
} from './fixtures/manager-snapshot.fixture';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';

/** Стор снапшотов фикстуры глазами этой спеки. */
type SnapshotStore = ReturnType<typeof snapshotStoreMock>;

/** Вид вызова upsert на шаге стиля: конверт снапшота стиля. */
type StyleUpsertMock = jest.Mock<
    Promise<AiAnalyticsSnapshotUpsertResult>,
    [SnapshotEnvelope<ManagerStylePayload>]
>;

/** Вид вызова lite-выборки call-lib: запрос отчёта за окно. */
type LoadLiteMock = jest.Mock<
    Promise<AnalyticsLiteDataset>,
    [CallReportAnalyticsQueryDto]
>;

/** Вид вызова загрузчика жёстких счётчиков: аргументы `load`. */
type CrmLoadMock = jest.Mock<
    Promise<StyleCrmResult>,
    Parameters<StyleCrmLoader['load']>
>;

/**
 * Конверты, ушедшие в стор. Приведение: фикстура snapshotStoreMock общая
 * для всех шагов и её upsert объявлен без дженериков — вид вызова
 * сужается здесь, в спеке шага, который эти конверты и пишет.
 */
const styleUpserts = (
    store: SnapshotStore,
): SnapshotEnvelope<ManagerStylePayload>[] =>
    (store.upsert as StyleUpsertMock).mock.calls.map(([envelope]) => envelope);

/**
 * Запрос первой lite-выборки. Приведение по той же причине: фикстура
 * callsLoaderWith отдаёт jest.Mock без дженериков.
 */
const firstLiteQuery = (loadLite: jest.Mock): CallReportAnalyticsQueryDto =>
    (loadLite as LoadLiteMock).mock.calls[0][0];

/** Разбор с оценёнными разделами «потребности» и «презентация». */
function styleCall(
    id: string,
    managerId: string,
    scores: { needs: number; presentation: number },
): DatedLiteRow {
    return liteRow({
        transcriptionId: id,
        managerId,
        callStartedAt: new Date('2026-08-12T09:00:00Z'),
        sections: [
            {
                section: 'NEEDS',
                relevance: 80,
                score: scores.needs,
                asWas: null,
                alternatives: [],
            },
            {
                section: 'PRESENTATION',
                relevance: 80,
                score: scores.presentation,
                asWas: null,
                alternatives: [],
            },
        ],
    }) as DatedLiteRow;
}

/** n разборов менеджера с заданным контрастом «потребности − презентация». */
function calls(
    managerId: string,
    count: number,
    contrast: number,
): DatedLiteRow[] {
    return Array.from({ length: count }, (_, index) =>
        styleCall(`${managerId}-${index}`, managerId, {
            needs: 5 + contrast,
            presentation: 5,
        }),
    );
}

/** Жёсткие счётчики менеджера за окно: ряды единиц осей 4, 7, 8. */
function crmMonth(
    managerId: string,
    units: Pick<
        StyleCrmUnits,
        'attemptsPerLead' | 'callsPerWorkday' | 'rhythmPerWorkday'
    >,
): StyleCrmManagerMonth {
    return {
        managerId,
        units: {
            ...units,
            conversationSecByType: byCallType<number[]>(() => []),
            leadResponseMin: [],
        },
        attemptsMedian: null,
        giveUpEvents: 0,
        giveUps: 0,
        giveUpRate: null,
        promises: 0,
        promisesKept: 0,
        promiseKeptRate: null,
        leadResponseMinMedian: null,
        conversationSecMedian: null,
        conversationSecMedianByType: byCallType<number | null>(() => null),
        dispersionIndex: null,
        incomingShare: null,
        callsPerWorkdayMean: null,
        calls: 0,
        workdays: units.callsPerWorkday.length,
    };
}

/** Загрузчик телефонии: отдаёт счётчики либо падает. */
function crmLoaderWith(
    managers: StyleCrmManagerMonth[] = [],
    error?: Error,
): { crm: StyleCrmLoader; load: CrmLoadMock } {
    const load = jest.fn(
        (
            _domain: string,
            from: string,
            to: string,
            managerIds?: readonly (string | number)[],
        ): Promise<StyleCrmResult> =>
            error
                ? Promise.reject(error)
                : Promise.resolve({
                      from,
                      to,
                      managerIds: (managerIds ?? []).map(Number),
                      months: [],
                      managers,
                      truncated: false,
                  }),
    ) as CrmLoadMock;
    return { crm: { load } as unknown as StyleCrmLoader, load };
}

/** Шаг с моками: разборы, стор и телефония (по умолчанию пустая). */
function makeStep(
    rows: DatedLiteRow[],
    options: { crm?: StyleCrmManagerMonth[]; crmError?: Error } = {},
) {
    const { loader, loadLite } = callsLoaderWith(rows);
    const store = snapshotStoreMock();
    const { crm, load } = crmLoaderWith(options.crm, options.crmError);
    return {
        step: new StyleStep(loader, store as never, crm),
        loadLite,
        store,
        crmLoad: load,
    };
}

const monthly = () => stepContext({ rhythm: 'monthly', monthKey: '2026-08' });

/** Шина с паспортами: полосы стажа для оффсета осей. */
function busWithPassport(): StepBus {
    const bus = createStepBus();
    bus.set(AI_PIPELINE_BUS_KEYS.passport, [
        { managerId: '10', tenureBand: '6-18' },
        { managerId: '20', tenureBand: '18+' },
    ]);
    return bus;
}

/** n осей менеджера в записанном профиле по коду. */
function axisN(
    written: SnapshotEnvelope<ManagerStylePayload>,
    code: string,
): number {
    return written.payload.axes.find(axis => axis.code === code)?.n ?? 0;
}

describe('Единицы осей стиля из разбора', () => {
    it('ось «вопросы против презентации» — контраст разделов рубрики', () => {
        // Тип звонка фикстуры — presentation, поэтому строка несёт и
        // маркер оси «куда уходят усилия» (поздняя стадия = 1).
        expect(
            axesOf(styleCall('t-1', '10', { needs: 8, presentation: 5 })),
        ).toEqual({ inquiry: 3, funnel_focus: 1 });
    });

    it('маркеров в разборе нет — оси молчат, ноль не подставляется', () => {
        const row = liteRow({
            transcriptionId: 't-1',
            callType: 'other',
        }) as DatedLiteRow;

        expect(axesOf(row)).toEqual({});
        expect(buildStyleRows([row])).toEqual([]);
    });

    it('строки без менеджера и без разбора в норму не идут', () => {
        const rows = [
            styleCall('t-1', '10', { needs: 8, presentation: 5 }),
            {
                ...styleCall('t-2', '10', { needs: 8, presentation: 5 }),
                managerId: null,
            },
            {
                ...styleCall('t-3', '10', { needs: 8, presentation: 5 }),
                analysisPresent: false,
            },
        ] as DatedLiteRow[];

        expect(buildStyleRows(rows)).toHaveLength(1);
    });

    it('полосы стажа собираются из паспортов шины', () => {
        expect(
            tenureBandsOf([
                { managerId: '10', tenureBand: '6-18' },
                { managerId: '20', tenureBand: null },
            ]),
        ).toEqual({ '10': '6-18' });
    });

    it('порог дисперсии для телефонии берётся из реестра портала', () => {
        expect(
            styleCrmThresholdsOf({
                portal: { style_dispersion_min_days: 20 },
            }),
        ).toEqual({ dispersionMinDays: 20 });
        // Слоёв нет — дефолт реестра (15), а не пустой объект.
        expect(styleCrmThresholdsOf({})).toEqual({ dispersionMinDays: 15 });
    });
});

describe('StyleStep — месячный профиль стиля', () => {
    it('код, ритм и окно в три месяца', async () => {
        const { step, loadLite } = makeStep(calls('10', 1, 1));

        expect(step.code).toBe('style');
        expect(step.rhythms).toEqual(['monthly']);

        await step.run(monthly(), busWithPassport());

        const args = firstLiteQuery(loadLite);
        expect(args.from).toBe('2026-05-31T21:00:00.000Z');
        expect(args.to).toBe('2026-08-31T20:59:59.999Z');
    });

    it('меньше сорока разборов за окно — профиль без доверия и без подписей', async () => {
        const { step, store } = makeStep([
            ...calls('10', 10, 3),
            ...calls('20', 10, 0),
        ]);

        const result = await step.run(monthly(), busWithPassport());

        expect(result.status).toBe('ok');
        const written = styleUpserts(store)[0];
        expect(written).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.style,
            periodKey: '2026-08',
        });
        expect(written.payload.confidence).toBe('none');
        expect(written.payload.confidenceReason).toBe('few-calls');
        expect(written.payload.tags).toEqual([]);
        expect(written.payload.vector).toEqual({});
        expect(written.payload.window).toEqual([
            '2026-06',
            '2026-07',
            '2026-08',
        ]);
    });

    it('профиль каждого менеджера ростера уезжает в шину для месяца', async () => {
        const { step } = makeStep(calls('10', 5, 1));
        const bus = busWithPassport();

        await step.run(
            stepContext({
                rhythm: 'monthly',
                monthKey: '2026-08',
                managerIds: [10, 20],
            }),
            bus,
        );

        const entries = bus.get<{ managerId: string }[]>(
            AI_PIPELINE_BUS_KEYS.style,
        );
        expect(entries?.map(entry => entry.managerId)).toEqual(['10', '20']);
    });

    it('в окне нет разборов — шаг пропущен с причиной, телефония не зовётся', async () => {
        const { step, store, crmLoad } = makeStep([]);

        const result = await step.run(monthly(), createStepBus());

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('style-window-empty');
        expect(store.upsert).not.toHaveBeenCalled();
        expect(crmLoad).not.toHaveBeenCalled();
    });

    it('ростер пуст — шаг пропущен, call-lib не зовётся', async () => {
        const { step, loadLite } = makeStep(calls('10', 5, 1));

        const result = await step.run(
            stepContext({ rhythm: 'monthly', managerIds: [] }),
            createStepBus(),
        );

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('roster-empty');
        expect(loadLite).not.toHaveBeenCalled();
    });
});

describe('StyleStep — жёсткие оси из телефонии и CRM (долг 30)', () => {
    /** Ряды единиц менеджера 10: 6 лидов, 4 рабочих дня. */
    const crmUnits = {
        attemptsPerLead: [1, 2, 3, 1, 2, 4],
        callsPerWorkday: [10, 12, 9, 11],
        rhythmPerWorkday: [-0.1, -0.2, -0.3, -0.1],
    };

    it('загрузчик зовётся за окно стиля с календарём, порогом реестра и forceRefresh', async () => {
        const { step, crmLoad } = makeStep(calls('10', 5, 1));
        const ctx = stepContext({
            rhythm: 'monthly',
            monthKey: '2026-08',
            managerIds: [10, 20],
            forceRefresh: true,
            registry: { portal: { style_dispersion_min_days: 20 } },
        });

        await step.run(ctx, busWithPassport());

        expect(crmLoad).toHaveBeenCalledTimes(1);
        const [domain, from, to, managerIds, options] = crmLoad.mock.calls[0];
        expect(domain).toBe(ctx.domain);
        expect(from).toBe('2026-06-01');
        expect(to).toBe('2026-08-31');
        expect(managerIds).toEqual([10, 20]);
        expect(options).toEqual({
            now: ctx.now,
            calendar: ctx.calendar,
            forceRefresh: true,
            thresholds: { dispersionMinDays: 20 },
        });
    });

    it('строки телефонии есть — оси persistence/tempo/rhythm непусты у менеджера', async () => {
        const { step, store } = makeStep(
            [...calls('10', 5, 1), ...calls('20', 5, 0)],
            { crm: [crmMonth('10', crmUnits)] },
        );

        const result = await step.run(
            stepContext({
                rhythm: 'monthly',
                monthKey: '2026-08',
                managerIds: [10, 20],
            }),
            busWithPassport(),
        );

        expect(result.status).toBe('ok');
        expect(result.reason).toBeUndefined();
        const written = styleUpserts(store);
        const ten = written.find(item => item.managerId === '10');
        const twenty = written.find(item => item.managerId === '20');
        expect(ten).toBeDefined();
        expect(twenty).toBeDefined();
        if (!ten || !twenty) return;
        // n оси — число единиц менеджера: лиды у настойчивости, дни у темпа и ритма.
        expect(axisN(ten, 'persistence')).toBe(crmUnits.attemptsPerLead.length);
        expect(axisN(ten, 'tempo')).toBe(crmUnits.callsPerWorkday.length);
        expect(axisN(ten, 'rhythm')).toBe(crmUnits.rhythmPerWorkday.length);
        // У менеджера без строк телефонии жёсткие оси молчат.
        expect(axisN(twenty, 'persistence')).toBe(0);
        expect(axisN(twenty, 'tempo')).toBe(0);
        expect(axisN(twenty, 'rhythm')).toBe(0);
    });

    it('без строк телефонии — прежнее поведение: жёсткие оси молчат, статус ok', async () => {
        const { step, store } = makeStep(calls('10', 5, 1));

        const result = await step.run(monthly(), busWithPassport());

        expect(result.status).toBe('ok');
        expect(result.reason).toBeUndefined();
        const [written] = styleUpserts(store);
        expect(axisN(written, 'persistence')).toBe(0);
        expect(axisN(written, 'tempo')).toBe(0);
        expect(axisN(written, 'rhythm')).toBe(0);
        // Оси разбора при этом на месте.
        expect(axisN(written, 'inquiry')).toBe(5);
    });

    it('телефония упала — профиль по разборам всё равно записан, причина в результате', async () => {
        const { step, store } = makeStep(calls('10', 5, 1), {
            crmError: new Error('voximplant.statistic.get: 503'),
        });

        const result = await step.run(monthly(), busWithPassport());

        expect(result.status).toBe('ok');
        expect(result.reason).toBe(AI_STYLE_CRM_UNAVAILABLE_REASON);
        expect(result.written).toBe(1);
        const [written] = styleUpserts(store);
        expect(axisN(written, 'inquiry')).toBe(5);
        expect(axisN(written, 'persistence')).toBe(0);
    });
});
