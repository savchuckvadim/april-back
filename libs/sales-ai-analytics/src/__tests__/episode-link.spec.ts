import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    type PbxDealSalesBaseStageCode,
    getSalesBaseStageOrder,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

import {
    AI_EPISODE_FAIL_STAGE_CODES,
    AI_EPISODE_SUCCESS_STAGE_CODE,
    type EpisodesByEntity,
    type StageTransition,
    buildEpisodes,
    groupEpisodesByEntity,
} from '../model/episode';
import {
    type CallForLink,
    type OpenDealRef,
    chainSharePct,
    countLinkedSales,
    linkCallsToEpisodes,
    linkedEpisodes,
} from '../model/episode-link';

const NOW = '2026-06-30T09:00:00+03:00';

const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;

const day = (number: number): string =>
    `2026-06-${String(number).padStart(2, '0')}T12:00:00+03:00`;

function semanticOf(code: PbxDealSalesBaseStageCode): 'P' | 'S' | 'F' {
    if (code === AI_EPISODE_SUCCESS_STAGE_CODE) {
        return 'S';
    }

    return AI_EPISODE_FAIL_STAGE_CODES.some(failCode => failCode === code)
        ? 'F'
        : 'P';
}

function transition(
    entityId: string,
    code: PbxDealSalesBaseStageCode,
    dayNumber: number,
): StageTransition {
    return {
        entityId,
        stageCode: code,
        order: getSalesBaseStageOrder(code),
        semantic: semanticOf(code),
        at: day(dayNumber),
    };
}

/** D1 — проданная сделка, D2 — открытая: обе живут с 1 по 30 июня. */
const EPISODES: EpisodesByEntity = groupEpisodesByEntity(
    buildEpisodes(
        [
            transition('D1', STAGE.presentation, 1),
            transition('D1', STAGE.success, 10),
            transition('D2', STAGE.presentation, 1),
        ],
        { now: NOW },
    ),
);

const call = (
    callId: string,
    dayNumber: number,
    entityType: CallForLink['entityType'],
    entityId: string,
): CallForLink => ({
    callId,
    at: day(dayNumber),
    entityType,
    entityId,
});

const openDeal = (
    dealId: string,
    openedDay: number,
    lastActivityDay: number | null,
    closedDay: number | null = null,
): OpenDealRef => ({
    dealId,
    openedAt: day(openedDay),
    closedAt: closedDay === null ? null : day(closedDay),
    lastActivityAt: lastActivityDay === null ? null : day(lastActivityDay),
});

describe('linkCallsToEpisodes: прямой путь и отсутствие двойного счёта', () => {
    const calls = [
        call('c1', 3, 'deal', 'D1'),
        call('c2', 5, 'deal', 'D1'),
        call('c3', 7, 'deal', 'D1'),
    ];
    const links = linkCallsToEpisodes(calls, EPISODES);

    it('три звонка одного эпизода дают одну продажу без двойного счёта', () => {
        expect(new Set(links.map(link => link.episodeKey))).toEqual(
            new Set(['D1#0']),
        );
        expect(linkedEpisodes(links, EPISODES)).toHaveLength(1);
        expect(countLinkedSales(links, EPISODES)).toBe(1);
    });

    it('прямой путь сцеплен уверенно и знает стадию начала эпизода', () => {
        expect(links[0]).toMatchObject({
            dealId: 'D1',
            episodeIndex: 0,
            stageCode: STAGE.presentation,
            confidence: 'high',
            path: 'deal',
            reason: 'direct-deal',
        });
    });

    it('xo-сделка сцепляется через основную сделку', () => {
        const [link] = linkCallsToEpisodes(
            [call('c4', 4, 'deal', 'X7')],
            EPISODES,
            { relatedToMainDeal: { X7: 'D1' } },
        );
        expect(link).toMatchObject({
            dealId: 'D1',
            episodeKey: 'D1#0',
            path: 'related',
            reason: 'related-deal',
            confidence: 'high',
        });
    });

    it('звонок вне жизни сделки не сцеплен', () => {
        const [link] = linkCallsToEpisodes(
            [call('c5', 20, 'deal', 'D1')],
            EPISODES,
        );
        expect(link).toMatchObject({
            dealId: 'D1',
            episodeKey: null,
            confidence: 'none',
            reason: 'no-episode',
        });
    });
});

describe('linkCallsToEpisodes: лид через конверсию', () => {
    it('лид сцепляется с эпизодом сделки через to_sale_deal', () => {
        const [link] = linkCallsToEpisodes(
            [call('c6', 4, 'lead', 'L1')],
            EPISODES,
            { leadToDeal: { L1: 'D1' } },
        );
        expect(link).toMatchObject({
            dealId: 'D1',
            episodeKey: 'D1#0',
            stageCode: STAGE.presentation,
            path: 'lead',
            confidence: 'high',
            reason: 'lead-converted',
        });
    });

    it('лид без конверсии не сцеплен', () => {
        const [link] = linkCallsToEpisodes(
            [call('c7', 4, 'lead', 'L2')],
            EPISODES,
            { leadToDeal: { L1: 'D1' } },
        );
        expect(link).toMatchObject({
            dealId: null,
            episodeKey: null,
            confidence: 'none',
            reason: 'lead-not-converted',
        });
    });
});

describe('linkCallsToEpisodes: запасной путь по компании и контакту', () => {
    it('одна открытая сделка компании на дату звонка — сцепка high', () => {
        const [link] = linkCallsToEpisodes(
            [call('c8', 5, 'company', 'C1')],
            EPISODES,
            { openDealsByCompany: { C1: [openDeal('D1', 1, 4)] } },
        );
        expect(link).toMatchObject({
            dealId: 'D1',
            episodeKey: 'D1#0',
            path: 'company',
            confidence: 'high',
            reason: 'single-open-deal',
        });
    });

    it('несколько открытых — ближайшая по активности и low', () => {
        const [link] = linkCallsToEpisodes(
            [call('c9', 5, 'company', 'C2')],
            EPISODES,
            {
                openDealsByCompany: {
                    C2: [openDeal('D1', 1, 2), openDeal('D2', 1, 6)],
                },
            },
        );
        expect(link).toMatchObject({
            dealId: 'D2',
            episodeKey: 'D2#0',
            path: 'company',
            confidence: 'low',
            reason: 'many-open-deals',
        });
    });

    it('ни одной открытой сделки на дату звонка — не сцеплен', () => {
        const [link] = linkCallsToEpisodes(
            [call('c10', 5, 'company', 'C3')],
            EPISODES,
            { openDealsByCompany: { C3: [openDeal('D1', 1, 1, 2)] } },
        );
        expect(link).toMatchObject({
            dealId: null,
            episodeKey: null,
            path: 'none',
            confidence: 'none',
            reason: 'no-open-deal',
        });
    });

    it('запасной путь по контакту работает так же', () => {
        const [link] = linkCallsToEpisodes(
            [call('c11', 5, 'contact', 'K1')],
            EPISODES,
            { openDealsByContact: { K1: [openDeal('D2', 1, null)] } },
        );
        expect(link).toMatchObject({
            dealId: 'D2',
            path: 'contact',
            confidence: 'high',
            reason: 'single-open-deal',
        });
    });

    it('выбор ближайшей сделки детерминирован: ничья разводится по dealId', () => {
        const hints = {
            openDealsByCompany: {
                C4: [openDeal('D2', 1, 5), openDeal('D1', 1, 5)],
            },
        };
        const first = linkCallsToEpisodes(
            [call('c12', 5, 'company', 'C4')],
            EPISODES,
            hints,
        );
        const second = linkCallsToEpisodes(
            [call('c12', 5, 'company', 'C4')],
            EPISODES,
            hints,
        );
        expect(first[0].dealId).toBe('D1');
        expect(second[0].dealId).toBe(first[0].dealId);
    });
});

describe('chainSharePct: доля сцепки — вход гистерезиса', () => {
    it('сцепленными считаются и high, и low', () => {
        const links = linkCallsToEpisodes(
            [
                call('c13', 3, 'deal', 'D1'),
                call('c14', 5, 'company', 'C2'),
                call('c15', 5, 'lead', 'L9'),
                call('c16', 20, 'deal', 'D1'),
            ],
            EPISODES,
            {
                openDealsByCompany: {
                    C2: [openDeal('D1', 1, 2), openDeal('D2', 1, 6)],
                },
            },
        );
        expect(links.map(link => link.confidence)).toEqual([
            'high',
            'low',
            'none',
            'none',
        ]);
        expect(chainSharePct(links)).toBe(50);
    });

    it('пустой список звонков даёт 0 %', () => {
        expect(chainSharePct([])).toBe(0);
    });

    it('звонок с неразбираемым моментом не сцеплен', () => {
        const [link] = linkCallsToEpisodes(
            [{ ...call('c17', 3, 'deal', 'D1'), at: 'не дата' }],
            EPISODES,
        );
        expect(link).toMatchObject({
            confidence: 'none',
            reason: 'no-episode',
        });
    });
});
