/**
 * Сборка эпизодов сделок (план Фазы 2, поток 13): эпизоды и их концы,
 * стадийные θ, факты сроков, лаги продаж, доля сцепки с гистерезисом 80/70
 * и плацебо-тест меток времени — на фикстуре переходов, без Битрикса.
 */
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { CallForLink } from '@lib/sales-ai-analytics';
import {
    assembleEpisodes,
    historyDepthMonths,
    medianCycleDays,
    saleTimestampFacts,
} from '../domain/assembler/episodes.assembler';
import { toStageTransitions } from '../domain/loaders/stage-history.mapper';
import {
    FIXTURE_NOW,
    REOPENED_SALE_ITEMS,
    STAGE_HISTORY_ITEMS,
    stageHistoryPortal,
} from './fixtures/stage-history.fixture';

const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;
const PORTAL = stageHistoryPortal();

const transitions = (withReopened = false) =>
    toStageTransitions(
        withReopened
            ? [...STAGE_HISTORY_ITEMS, ...REOPENED_SALE_ITEMS]
            : STAGE_HISTORY_ITEMS,
        PORTAL,
    );

/** Звонок по сделке в момент `at` — вход сцепки. */
const call = (id: string, entityId: string, at: string): CallForLink => ({
    callId: id,
    at,
    entityType: 'deal',
    entityId,
});

/** n звонков, из них linked по сделке 101 внутри первого эпизода. */
function calls(total: number, linked: number): CallForLink[] {
    return Array.from({ length: total }, (_, index) =>
        call(
            `c${index}`,
            index < linked ? '101' : '999',
            '2026-06-02T12:00:00+03:00',
        ),
    );
}

describe('assembleEpisodes: эпизоды, концы и длительности', () => {
    const assembly = assembleEpisodes({
        transitions: transitions(),
        now: FIXTURE_NOW,
    });

    it('строит эпизоды по каждой сделке фикстуры', () => {
        expect(assembly.episodes).toHaveLength(8);
        expect(Object.keys(assembly.episodesByEntity).sort()).toEqual([
            '101',
            '102',
            '103',
            '104',
        ]);
    });

    it('концы: продвижение, отказ по стадии и цензура открытой сделки', () => {
        const ends = assembly.episodes.map(episode => episode.end);
        expect(ends.filter(end => end === 'advance')).toHaveLength(6);
        expect(ends.filter(end => end === 'fail')).toHaveLength(1);
        expect(ends.filter(end => end === 'censored')).toHaveLength(1);
        const failed = assembly.episodes.find(
            episode => episode.end === 'fail',
        );
        expect(failed).toMatchObject({
            entityId: '102',
            stageCode: STAGE.presentation,
            endReason: 'fail-stage',
            durationDays: 15,
        });
    });

    it('длительности: закрытые — в днях, у цензурированного — возраст', () => {
        const byKey = new Map(
            assembly.episodes.map(episode => [episode.key, episode]),
        );
        expect(byKey.get('101#0')?.durationDays).toBe(2);
        expect(byKey.get('101#1')?.durationDays).toBe(7);
        expect(byKey.get('104#1')?.durationDays).toBe(16);
        expect(byKey.get('103#1')?.durationDays).toBeNull();
        expect(byKey.get('103#1')?.ageDays).toBe(113);
        expect(assembly.openEpisodes.map(episode => episode.key)).toEqual([
            '103#1',
        ]);
    });

    it('стадийные θ: знаменатель — сделки с исходом, открытые в цензуре', () => {
        const byStage = new Map(
            assembly.stageThetas.map(theta => [theta.stageCode, theta]),
        );
        expect(byStage.get(STAGE.new)).toMatchObject({
            n: 3,
            s: 2,
            censored: 1,
            order: 1,
        });
        expect(byStage.get(STAGE.presentation)).toMatchObject({
            n: 3,
            s: 2,
            censored: 1,
            order: 4,
        });
        expect([...byStage.keys()]).toEqual([STAGE.new, STAGE.presentation]);
    });

    it('факты сроков: p25/p50/p90 только по закрытым эпизодам', () => {
        expect(assembly.slaFacts[STAGE.new]).toEqual({
            p25: 2.75,
            p50: 6.5,
            p90: 15.6,
            n: 4,
        });
        expect(assembly.slaFacts[STAGE.presentation]).toEqual({
            p25: 11,
            p50: 15,
            p90: 15.8,
            n: 3,
        });
    });

    it('лаги продаж: продажи — фактом, открытая сделка — цензурой', () => {
        const byEntity = new Map(
            assembly.saleLags.map(lag => [lag.entityId, lag]),
        );
        expect(byEntity.get('101')).toMatchObject({
            lagDays: 9,
            days: 9,
            censored: false,
        });
        expect(byEntity.get('104')?.lagDays).toBe(34);
        expect(byEntity.get('103')).toMatchObject({
            lagDays: 123,
            censored: true,
        });
        expect(byEntity.has('102')).toBe(false);
    });

    it('глубина истории — размах меток времени в месяцах', () => {
        expect(assembly.historyMonths).toBeGreaterThan(3);
        expect(assembly.historyMonths).toBeCloseTo(110 / 30.44, 2);
        expect(historyDepthMonths([])).toBe(0);
    });
});

describe('assembleEpisodes: медиана цикла', () => {
    it('до гейта по продажам берётся значение реестра', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
            minSales: 8,
            cycleMedianDefault: 28,
        });
        expect(assembly.cycleMedianDays).toBe(28);
    });

    it('на достаточном числе продаж — p50 фактических лагов', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
            minSales: 2,
            cycleMedianDefault: 28,
        });
        expect(assembly.cycleMedianDays).toBe(21.5);
    });

    it('пустая выборка не превращается в нулевой цикл', () => {
        expect(medianCycleDays([], 1, 28)).toBe(28);
    });
});

describe('assembleEpisodes: сцепка и гистерезис трактовки ребра', () => {
    it('доля сцепки 80 % переводит ребро из интенсивности в вероятность', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
            calls: calls(5, 4),
            currentEstimand: 'rate',
            enterPct: 80,
            exitPct: 70,
        });
        expect(assembly.chainSharePct).toBe(80);
        expect(assembly.chain.estimand).toMatchObject({
            estimand: 'prob',
            switched: true,
            reason: 'chain-entered',
            paramCode: 'theta_edge_prob',
        });
        expect(assembly.chain.linked).toBe(4);
        expect(assembly.links).toHaveLength(5);
    });

    it('79 % не переводит: порог входа — 80', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
            calls: calls(100, 79),
            currentEstimand: 'rate',
            enterPct: 80,
            exitPct: 70,
        });
        expect(assembly.chainSharePct).toBe(79);
        expect(assembly.chain.estimand).toMatchObject({
            estimand: 'rate',
            switched: false,
            reason: 'chain-below-enter',
        });
    });

    it('70 % удерживает вероятность, 69 % возвращает к интенсивности', () => {
        const hold = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
            calls: calls(100, 70),
            currentEstimand: 'prob',
            enterPct: 80,
            exitPct: 70,
        });
        expect(hold.chain.estimand).toMatchObject({
            estimand: 'prob',
            switched: false,
            reason: 'chain-hold',
        });
        const exited = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
            calls: calls(100, 69),
            currentEstimand: 'prob',
            enterPct: 80,
            exitPct: 70,
        });
        expect(exited.chain.estimand).toMatchObject({
            estimand: 'rate',
            switched: true,
            reason: 'chain-exited',
        });
    });

    it('без звонков сцепки нет и ребро остаётся интенсивностью', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
        });
        expect(assembly.chainSharePct).toBe(0);
        expect(assembly.chain.estimand.estimand).toBe('rate');
        expect(assembly.chain.sales).toBe(0);
    });

    it('три звонка одного эпизода дают одну продажу, а не три', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
            calls: [
                call('c1', '101', '2026-06-04T09:00:00+03:00'),
                call('c2', '101', '2026-06-05T09:00:00+03:00'),
                call('c3', '101', '2026-06-06T09:00:00+03:00'),
            ],
        });
        expect(assembly.chain.linked).toBe(3);
        expect(assembly.chain.sales).toBe(1);
    });
});

describe('assembleEpisodes: плацебо-тест меток времени', () => {
    it('возврат на презентацию после продажи — протечка метки', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(true),
            now: FIXTURE_NOW,
        });
        expect(assembly.leak).toMatchObject({
            n: 3,
            leaked: 1,
            flagged: true,
        });
        expect(assembly.leak.sharePct).toBeCloseTo(33.33, 2);
        expect(assembly.leak.leaks[0]).toMatchObject({
            episodeKey: '105#1',
            source: 'presentation',
            aheadDays: 5,
        });
    });

    it('без возвратов доля протечки нулевая и флага нет', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
        });
        expect(assembly.leak).toMatchObject({
            n: 2,
            leaked: 0,
            sharePct: 0,
            flagged: false,
        });
    });

    it('готовые метки продаж вытесняют выведенные из истории', () => {
        const assembly = assembleEpisodes({
            transitions: transitions(),
            now: FIXTURE_NOW,
            saleTimestamps: [
                {
                    episodeKey: '101#1',
                    closedAt: '2026-06-10T10:00:00+03:00',
                    lastPresentationAt: '2026-06-12T10:00:00+03:00',
                    lastInvoiceAt: null,
                },
            ],
        });
        expect(assembly.leak).toMatchObject({ n: 1, leaked: 1 });
    });

    it('метки выводятся по успешному эпизоду и последним стадиям сделки', () => {
        const facts = saleTimestampFacts(
            assembleEpisodes({
                transitions: transitions(true),
                now: FIXTURE_NOW,
            }).episodesByEntity,
            transitions(true),
        );
        const reopened = facts.find(fact => fact.episodeKey === '105#1');
        expect(reopened).toMatchObject({
            closedAt: '2026-04-20T10:00:00+03:00',
            lastPresentationAt: '2026-04-25T10:00:00+03:00',
            lastInvoiceAt: null,
        });
    });
});
