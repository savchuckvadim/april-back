import { dealMovementVerdict } from '@lib/sales-ai-analytics';
import {
    buildDealMovementDossier,
    needsHistory,
    toNightDeal,
} from '../lib/deal-movement-dossier.mapper';
import { applyCap } from '../services/deal-movement-evaluator.service';
import { dealRow } from './deal-movement.fixture';

const NOW = '2026-11-17T23:30:00.000Z';

describe('досье сделки для правил статуса', () => {
    it('стадия, активность и сумма — из сделки; p90, θ и аудит в этой волне пусты', () => {
        const dossier = buildDealMovementDossier(
            dealRow(9041, { stageOrder: 5 }),
            [{ at: '2026-11-15T09:00:00.000Z', fromOrder: 7, toOrder: 5 }],
            [],
        );

        expect(dossier).toEqual({
            dealId: '9041',
            stageEnteredAt: '2026-11-15T09:00:00.000Z',
            stageOrder: 5,
            lastActivityAt: '2026-11-16T09:00:00.000Z',
            transitions: [
                { at: '2026-11-15T09:00:00.000Z', fromOrder: 7, toOrder: 5 },
            ],
            stageNormDays: null,
            stageChance: null,
            amount: 100_000,
            calls: [],
            // Активность по сделке — контакт после договорённости.
            closedActivitiesAt: ['2026-11-16T09:00:00.000Z'],
            // Дела Битрикса не читались.
            work: [],
            forgotten: null,
        });
        expect(dealMovementVerdict(dossier, NOW).status).toBe('rolled_back');
    });

    it('договорённость выполнена активностью по сделке, даже без разобранного звонка', () => {
        const verdict = dealMovementVerdict(
            buildDealMovementDossier(
                dealRow(1, { lastActivityAt: '2026-11-12T10:00:00.000Z' }),
                [],
                [
                    {
                        at: '2026-11-05T10:00:00.000Z',
                        progress: 3,
                        nextStep: { set: true, date: '2026-11-11' },
                    },
                ],
            ),
            NOW,
        );

        expect(verdict.reasons).toContain('step_done');
        expect(verdict.status).toBe('moving');
    });

    it('без MOVED_TIME отсчёт от создания сделки', () => {
        expect(
            buildDealMovementDossier(dealRow(1, { movedAt: null }), [], [])
                .stageEnteredAt,
        ).toBe('2026-10-01T09:00:00.000Z');
    });

    it('история нужна только сделкам, сдвинутым за окно', () => {
        const windowStart = Date.parse('2026-11-03T23:30:00.000Z');
        expect(needsHistory(dealRow(1), windowStart)).toBe(true);
        expect(
            needsHistory(
                dealRow(2, { movedAt: '2026-10-01T09:00:00.000Z' }),
                windowStart,
            ),
        ).toBe(false);
        expect(needsHistory(dealRow(3, { movedAt: null }), windowStart)).toBe(
            false,
        );
    });

    it('вход плана ночи несёт название, сумму и ответственного', () => {
        const row = dealRow(7);
        const verdict = dealMovementVerdict(
            buildDealMovementDossier(row, [], []),
            NOW,
        );
        expect(toNightDeal(row, verdict)).toEqual({
            verdict,
            title: 'Сделка 7',
            stageCode: 'sales_pres',
            amount: 100_000,
            assignedById: 7,
            lastActivityAt: '2026-11-16T09:00:00.000Z',
        });
    });
});

describe('потолок сделок за ночь', () => {
    it('оцениваются самые новые по номеру, остальные переносятся', () => {
        const { evaluated, carryOver } = applyCap(
            [dealRow(5), dealRow(30), dealRow(12)],
            2,
        );
        expect(evaluated.map(row => row.dealId)).toEqual([30, 12]);
        expect(carryOver.map(row => row.dealId)).toEqual([5]);
    });
});
