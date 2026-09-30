import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    getSalesBaseStageOrder,
    type PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    BETA_SAMPLE_DEFAULTS,
    buildEpisodes,
    type BetaSampleCall,
    type DealEpisode,
    type StageTransition,
} from '@lib/sales-ai-analytics';
import {
    assemblePortalBetaSample,
    betaCallsOf,
    formSectionsOf,
    leadKindResolverOf,
    portalIsoOf,
    strataDimensionsOf,
    type BetaSampleAssemblyInput,
    type BetaSampleSourceRow,
} from '../domain/assembler/beta-sample.assembler';
import type { CallEntityRef } from '../domain/loaders/call-entity.loader';

/**
 * Сборка выборки β в приложении (Фаза 4, П15): время звонка в поясе
 * портала, сцепка с эпизодами шины, триггер и контроли, S^form, страты по
 * измерениям портала, цензура, отброшенные звонки, оффсет и лид плацебо.
 */
const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;
const TZ = 'Europe/Moscow';
const NOW = '2026-03-31T12:00:00+03:00';

const day = (value: number, hour = 12): string =>
    `2026-03-${String(value).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+03:00`;

const transition = (
    entityId: string,
    code: PbxDealSalesBaseStageCode,
    value: number,
): StageTransition => ({
    entityId,
    stageCode: code,
    order: getSalesBaseStageOrder(code),
    semantic: code === STAGE.fail ? 'F' : 'P',
    at: day(value),
});

const EPISODES: DealEpisode[] = buildEpisodes(
    [
        transition('d1', STAGE.presentation, 1),
        transition('d1', STAGE.offerCreate, 12),
        transition('d2', STAGE.cold, 1),
        transition('d2', STAGE.presentation, 2),
        transition('d2', STAGE.fail, 9),
        transition('d4', STAGE.presentation, 25),
        transition('d5', STAGE.presentation, 1),
        transition('d5', STAGE.offerCreate, 4),
    ],
    { now: NOW },
);

/** Строка звонка: момент — день марта в МСК (UTC+3). */
const row = (
    patch: Partial<BetaSampleSourceRow> & {
        transcriptionId: string;
        at: string;
    },
): BetaSampleSourceRow => ({
    managerId: '10',
    callType: 'presentation',
    score: null,
    sections: [],
    ...patch,
    callStartedAt: new Date(patch.at),
});

const ROWS: BetaSampleSourceRow[] = [
    // Триггер эпизода d1: форма из двух разделов → S = 7; исход — КП на 11-й день.
    row({
        transcriptionId: 'c1',
        at: day(2, 10),
        sections: [
            { section: 'GREETING', relevance: 80, score: 8 },
            { section: 'NEEDS', relevance: 60, score: 6 },
            { section: 'OBJECTIONS', relevance: 90, score: 1 },
        ],
    }),
    // Вторая презентация того же эпизода — не триггер.
    row({ transcriptionId: 'c2', at: day(3), score: 90 }),
    // Звонок другого типа в эпизоде — контроль.
    row({ transcriptionId: 'c3', at: day(4), callType: 'call', score: 60 }),
    // Триггер эпизода d2 (сделка с холодной стадии): балл разбора 50 → S = 5, отказ.
    row({ transcriptionId: 'c4', at: day(3), score: 50 }),
    // Открытый эпизод d4: окно ещё не истекло — цензура.
    row({ transcriptionId: 'c5', at: day(26), score: 70 }),
    // Без сущности CRM — несцеплен.
    row({ transcriptionId: 'c6', at: day(5), score: 70 }),
    // Эпизод d5 без оценки — no-score.
    row({ transcriptionId: 'c7', at: day(2) }),
    // Звонок того же менеджера через 2 недели после c1 — лид плацебо (S = 9).
    row({
        transcriptionId: 'c8',
        at: day(16, 10),
        callType: 'call',
        sections: [{ section: 'GREETING', relevance: 50, score: 9 }],
    }),
    row({ transcriptionId: 'c9', at: day(2), managerId: null, score: 80 }),
];

const ref = (transcriptionId: string, entityId: string): CallEntityRef => ({
    transcriptionId,
    entityType: 'deal',
    entityId,
});

const REFS = new Map<string, CallEntityRef>(
    [
        ref('c1', 'd1'),
        ref('c2', 'd1'),
        ref('c3', 'd1'),
        ref('c4', 'd2'),
        ref('c5', 'd4'),
        ref('c7', 'd5'),
    ].map(item => [item.transcriptionId, item]),
);

const input = (
    patch: Partial<BetaSampleAssemblyInput> = {},
): BetaSampleAssemblyInput => ({
    rows: ROWS,
    refs: REFS,
    episodes: EPISODES,
    timeZone: TZ,
    now: NOW,
    registry: {},
    monthKeys: ['2026-02', '2026-03'],
    offsetLogit: 0.25,
    ...patch,
});

const firstEpisode = (stageCode: string): DealEpisode =>
    ({ stageCode }) as DealEpisode;

const call = (patch: Partial<BetaSampleCall> = {}): BetaSampleCall => ({
    callId: 'x',
    managerId: '10',
    at: day(2),
    callType: 'presentation',
    score: 50,
    sections: [],
    ...patch,
});

describe('portalIsoOf — момент звонка в поясе портала', () => {
    it('тот же инстант, календарь и смещение портала', () => {
        const iso = portalIsoOf(new Date('2026-03-02T07:00:00Z'), TZ);
        expect(iso).toBe('2026-03-02T10:00:00.000+03:00');
        expect(Date.parse(iso)).toBe(Date.parse('2026-03-02T07:00:00Z'));
    });

    it('поздний вечер 31-го по Москве не уезжает в следующий месяц UTC и наоборот', () => {
        expect(
            portalIsoOf(new Date('2026-08-31T20:30:00Z'), TZ).slice(0, 7),
        ).toBe('2026-08');
        expect(
            portalIsoOf(new Date('2026-08-31T21:30:00Z'), TZ).slice(0, 7),
        ).toBe('2026-09');
    });

    it('отрицательное смещение пояса', () => {
        expect(
            portalIsoOf(new Date('2026-01-15T12:00:00Z'), 'America/New_York'),
        ).toBe('2026-01-15T07:00:00.000-05:00');
    });
});

describe('страты и состав формы из реестра портала', () => {
    it('по умолчанию — вид работы с лидом и стадия сделки', () => {
        expect(strataDimensionsOf({})).toEqual([
            'lead_work_kind',
            'sales_base_stage',
        ]);
        const resolve = leadKindResolverOf(strataDimensionsOf({}));
        const episode = firstEpisode(STAGE.presentation);
        expect(resolve(call({ entityType: 'lead' }), episode, episode)).toBe(
            'lead',
        );
        expect(resolve(call(), episode, firstEpisode(STAGE.cold))).toBe('cold');
        expect(resolve(call(), episode, episode)).toBe('request');
    });

    it('портал выключил стадию — холодная сделка идёт в «заявки»', () => {
        const dims = strataDimensionsOf({
            portal: { lead_kind_strata: 'company_size,lead_work_kind' },
        });
        expect(dims).toEqual(['lead_work_kind', 'company_size']);
        const resolve = leadKindResolverOf(dims);
        const cold = firstEpisode(STAGE.cold);
        expect(resolve(call(), cold, cold)).toBe('request');
        expect(resolve(call({ entityType: 'lead' }), cold, cold)).toBe('lead');
    });

    it('состав формы — csv реестра', () => {
        expect(formSectionsOf({})).toEqual(BETA_SAMPLE_DEFAULTS.formSections);
    });
});

describe('betaCallsOf — строки звонков в звонки выборки', () => {
    it('без менеджера — отброшена; сущность из ais; время в поясе портала', () => {
        const calls = betaCallsOf(ROWS, REFS, TZ);
        expect(calls.map(item => item.callId)).not.toContain('c9');
        const c1 = calls.find(item => item.callId === 'c1');
        expect(c1?.entityType).toBe('deal');
        expect(c1?.at).toBe('2026-03-02T10:00:00.000+03:00');
        expect(calls.find(item => item.callId === 'c6')?.entityType).toBe(
            undefined,
        );
    });
});

describe('assemblePortalBetaSample — выборка «триггер → ближний исход»', () => {
    const { sample, links } = assemblePortalBetaSample(input());
    const byId = new Map(sample.rows.map(item => [item.callId, item]));

    it('в выборке только первые презентации эпизодов с оценкой и закрытым окном', () => {
        expect(sample.rows.map(item => item.callId).sort()).toEqual([
            'c1',
            'c4',
        ]);
        expect(sample.n).toBe(2);
        expect(sample.events).toBe(1);
        expect(links).toHaveLength(8);
    });

    it('S^form — среднее разделов формы, без формы — балл разбора/10', () => {
        expect(byId.get('c1')?.score).toBe(7);
        expect(byId.get('c1')?.scoreSource).toBe('form');
        expect(byId.get('c4')?.score).toBe(5);
        expect(byId.get('c4')?.scoreSource).toBe('total');
    });

    it('исход: КП в окне → 1, отказ → 0; контроли считаются в эпизоде', () => {
        expect(byId.get('c1')?.outcome).toBe(1);
        expect(byId.get('c1')?.callsInEpisode).toBe(2);
        expect(byId.get('c4')?.outcome).toBe(0);
    });

    it('страты: сделка с холодной стадии — cold, остальные — request', () => {
        expect(byId.get('c1')?.stratum).toBe('request');
        expect(byId.get('c4')?.stratum).toBe('cold');
    });

    it('причины отбрасывания по каждому звонку', () => {
        expect(sample.dropped).toEqual({
            'bad-time': 0,
            'no-link': 2,
            'no-episode': 0,
            control: 1,
            'not-trigger': 1,
            'no-score': 1,
            censored: 1,
        });
    });

    it('оффсет портал×месяц и ключ месяца — в поясе портала', () => {
        expect(byId.get('c1')?.monthKey).toBe('2026-03');
        expect(byId.get('c1')?.offset).toBe(0.25);
    });

    it('лид плацебо — среднее S менеджера через beta_placebo_lead_weeks недель', () => {
        expect(byId.get('c1')?.sBarLead).toBe(9);
        // c4 — та же неделя, что и c1: лид тот же.
        expect(byId.get('c4')?.sBarLead).toBe(9);
        const late = assemblePortalBetaSample(
            input({ rows: ROWS.filter(item => item.transcriptionId !== 'c8') }),
        );
        expect(late.sample.rows.every(item => item.sBarLead === null)).toBe(
            true,
        );
    });

    it('без оффсета модели — ноль', () => {
        const bare = assemblePortalBetaSample(input({ offsetLogit: null }));
        expect(bare.sample.rows.every(item => item.offset === 0)).toBe(true);
    });

    it('окно ближнего исхода портала: 7 дней — КП на 10-й день уже не исход', () => {
        const short = assemblePortalBetaSample(
            input({ registry: { portal: { lag_window_near_days: 7 } } }),
        );
        const c1 = short.sample.rows.find(item => item.callId === 'c1');
        expect(short.sample.windowDays).toBe(7);
        expect(c1?.outcome).toBe(0);
    });

    it('детерминирован: тот же вход — та же выборка', () => {
        expect(assemblePortalBetaSample(input()).sample).toEqual(sample);
    });
});
