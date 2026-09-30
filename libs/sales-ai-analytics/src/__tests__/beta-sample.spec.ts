import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    getSalesBaseStageOrder,
    type PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    AI_BETA_DROP_REASONS,
    AI_BETA_LEAD_KINDS,
    AI_BETA_TRIGGER_CALL_TYPE,
    BETA_SAMPLE_DEFAULTS,
    type BetaSampleCall,
    buildBetaSample,
    formScoreOfCall,
} from '../model/beta-sample';
import { weekIndexOf } from '../model/beta-sample.score';
import {
    type StageTransition,
    buildEpisodes,
    groupEpisodesByEntity,
} from '../model/episode';
import type { CallLink } from '../model/episode-link.types';
import { csvItems } from '../params/registry.validate';
import { registryDefault } from '../params/registry.access';

const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;
const NOW = '2026-03-31T12:00:00+03:00';

const at = (day: number, hour = 12): string =>
    `2026-03-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+03:00`;

const transition = (
    entityId: string,
    code: PbxDealSalesBaseStageCode,
    day: number,
): StageTransition => ({
    entityId,
    stageCode: code,
    order: getSalesBaseStageOrder(code),
    semantic: code === STAGE.fail ? 'F' : 'P',
    at: at(day),
});

const episodesByEntity = groupEpisodesByEntity(
    buildEpisodes(
        [
            transition('d1', STAGE.presentation, 1),
            transition('d1', STAGE.offerCreate, 8),
            transition('d2', STAGE.cold, 1),
            transition('d2', STAGE.presentation, 2),
            transition('d2', STAGE.fail, 9),
            transition('d3', STAGE.presentation, 1),
            transition('d3', STAGE.offerCreate, 5),
            transition('d4', STAGE.presentation, 25),
            transition('d5', STAGE.presentation, 1),
            transition('d5', STAGE.offerCreate, 4),
        ],
        { now: NOW },
    ),
);

const call = (
    patch: Partial<BetaSampleCall> & { callId: string },
): BetaSampleCall => ({
    managerId: 'm1',
    at: at(2),
    callType: AI_BETA_TRIGGER_CALL_TYPE,
    score: null,
    sections: [],
    ...patch,
});

const link = (callId: string, dealId: string, index = 0): CallLink => ({
    callId,
    dealId,
    episodeKey: `${dealId}#${index}`,
    episodeIndex: index,
    stageCode: STAGE.presentation,
    confidence: 'high',
    path: 'deal',
    reason: 'direct-deal',
});

const FORM = ['GREETING', 'NEEDS', 'CLOSING'];

const calls: BetaSampleCall[] = [
    call({
        callId: 'c1',
        at: at(2, 10),
        sections: [
            { section: 'GREETING', relevance: 80, score: 8 },
            { section: 'NEEDS', relevance: 60, score: 6 },
            { section: 'CLOSING', relevance: 0, score: 2 },
            { section: 'OBJECTIONS', relevance: 90, score: 1 },
        ],
    }),
    call({ callId: 'c0', at: at(2, 9), callType: 'call', score: 50 }),
    call({ callId: 'c2', at: at(3), score: 90 }),
    call({
        callId: 'c3',
        managerId: 'm2',
        at: at(3),
        score: 60,
        entityType: 'deal',
    }),
    call({ callId: 'c4', managerId: 'm2', at: at(2) }),
    call({ callId: 'c5', at: at(2) }),
    call({ callId: 'c6', at: at(2) }),
    call({ callId: 'c7', at: 'вчера' }),
    call({ callId: 'c8', at: at(26), score: 70 }),
    call({
        callId: 'c9',
        managerId: 'm2',
        at: at(2),
        score: 40,
        entityType: 'lead',
    }),
    call({
        callId: 'lead-a',
        managerId: 'm1',
        at: at(16),
        score: 80,
        callType: 'call',
    }),
    call({
        callId: 'lead-b',
        managerId: 'm1',
        at: at(17),
        score: 60,
        callType: 'call',
    }),
];

const links: CallLink[] = [
    link('c1', 'd1'),
    link('c0', 'd1'),
    link('c2', 'd1'),
    link('c3', 'd2', 1),
    link('c4', 'd3'),
    { ...link('c5', 'd1'), confidence: 'none', dealId: null, episodeKey: null },
    link('c6', 'd9'),
    link('c8', 'd4'),
    link('c9', 'd5'),
];

const build = () =>
    buildBetaSample({
        calls,
        links,
        episodesByEntity,
        params: { now: NOW, formSections: FORM, leadWeeks: 2 },
    });

describe('buildBetaSample — выборка «звонок-триггер → ближний исход» (план §4.4)', () => {
    const sample = build();
    const rowOf = (callId: string) => {
        const row = sample.rows.find(item => item.callId === callId);
        if (!row) {
            throw new Error(`нет строки ${callId}`);
        }

        return row;
    };

    it('дефолты — из реестра: форма, окно, сдвиг лида, тип триггера', () => {
        expect(BETA_SAMPLE_DEFAULTS.formSections).toEqual(
            csvItems(registryDefault('quality_form_sections')),
        );
        expect(BETA_SAMPLE_DEFAULTS.windowDays).toBe(
            registryDefault('lag_window_near_days'),
        );
        expect(BETA_SAMPLE_DEFAULTS.leadWeeks).toBe(
            registryDefault('beta_placebo_lead_weeks'),
        );
        expect(BETA_SAMPLE_DEFAULTS.triggerCallType).toBe('presentation');
        expect(AI_BETA_LEAD_KINDS).toEqual(['cold', 'request', 'lead']);
    });

    it('строки — только первые презентации эпизодов, в порядке времени', () => {
        expect(sample.rows.map(row => row.callId)).toEqual(['c1', 'c9', 'c3']);
        expect(sample.n).toBe(3);
        expect(sample.managers).toBe(2);
    });

    it('S^form — среднее разделов формы с relevance > 0, иначе балл/10', () => {
        expect(rowOf('c1').score).toBe(7);
        expect(rowOf('c1').scoreSource).toBe('form');
        expect(rowOf('c3').score).toBe(6);
        expect(rowOf('c3').scoreSource).toBe('total');
        expect(formScoreOfCall(call({ callId: 'x' }), FORM)).toBeNull();
    });

    it('остальные звонки эпизода — в счётчик, вторая презентация не строка', () => {
        expect(rowOf('c1').callsInEpisode).toBe(2);
        expect(rowOf('c1').logCalls).toBeCloseTo(Math.log(3), 12);
        expect(sample.dropped['not-trigger']).toBe(1);
        expect(sample.dropped.control).toBe(1);
    });

    it('исходы: КП в окне — 1, отказ — 0, открытое окно — цензура', () => {
        expect(rowOf('c1').outcome).toBe(1);
        expect(rowOf('c1').daysToOutcome).toBeCloseTo(6 + 2 / 24, 6);
        expect(rowOf('c3').outcome).toBe(0);
        expect(sample.dropped.censored).toBe(1);
        expect(sample.events).toBe(2);
    });

    it('причины отбрасывания сходятся по словарю', () => {
        expect(Object.keys(sample.dropped)).toEqual([...AI_BETA_DROP_REASONS]);
        // c5 без сцепки и два звонка лида плацебо без сцепок.
        expect(sample.dropped['no-link']).toBe(3);
        expect(sample.dropped['no-episode']).toBe(1);
        expect(sample.dropped['no-score']).toBe(1);
        expect(sample.dropped['bad-time']).toBe(1);
    });

    it('страты: лид → lead, холодная сделка → cold, иначе request', () => {
        expect(rowOf('c9').stratum).toBe('lead');
        expect(rowOf('c3').stratum).toBe('cold');
        expect(rowOf('c1').stratum).toBe('request');
        expect(sample.strata).toEqual(['cold', 'request', 'lead']);
    });

    it('центрирование Мундлака: S̄_m, S̄_p и разности сходятся', () => {
        expect(sample.sBarByManager).toEqual({ m1: 7, m2: 5 });
        expect(sample.sBarPortal).toBeCloseTo(17 / 3, 12);
        const row = rowOf('c3');
        expect(row.sWithin).toBeCloseTo(6 - 5, 12);
        expect(row.sBetween).toBeCloseTo(5 - 17 / 3, 12);
        expect(row.sCentered).toBeCloseTo(6 - 17 / 3, 12);
    });

    it('оффсет портал×месяц по ключу месяца; нет ключа — 0', () => {
        const withOffset = buildBetaSample({
            calls,
            links,
            episodesByEntity,
            params: {
                now: NOW,
                formSections: FORM,
                offsetLogitByMonth: { '2026-03': -0.4 },
            },
        });
        expect(withOffset.rows.every(row => row.offset === -0.4)).toBe(true);
        expect(withOffset.rows[0].monthKey).toBe('2026-03');
        expect(sample.rows.every(row => row.offset === 0)).toBe(true);
    });

    it('лид плацебо — среднее S менеджера через k недель, иначе null', () => {
        expect(rowOf('c1').sBarLead).toBe(7);
        expect(rowOf('c9').sBarLead).toBeNull();
    });

    it('недели лида считаются с понедельника (ISO), а не с четверга эпохи', () => {
        const week = (iso: string) => weekIndexOf(Date.parse(iso));
        // 2026-03-01 — воскресенье, 2026-03-02 — понедельник.
        expect(week('2026-03-02T00:00:00Z')).toBe(
            week('2026-03-01T00:00:00Z') + 1,
        );
        expect(week('2026-03-08T23:59:59Z')).toBe(week('2026-03-02T00:00:00Z'));
        expect(week('2026-03-16T12:00:00Z')).toBe(
            week('2026-03-02T12:00:00Z') + 2,
        );
    });

    it('детерминизм: две сборки равны', () => {
        expect(build()).toEqual(sample);
    });

    it('пустой вход — пустая выборка без чисел', () => {
        const empty = buildBetaSample({
            calls: [],
            links: [],
            episodesByEntity: {},
            params: { now: NOW },
        });
        expect(empty.n).toBe(0);
        expect(empty.events).toBe(0);
        expect(empty.strata).toEqual([]);
        expect(empty.sBarPortal).toBe(0);
    });
});
