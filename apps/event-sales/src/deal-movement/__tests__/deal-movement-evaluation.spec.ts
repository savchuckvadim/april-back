import {
    DEAL_MOVEMENT_DEFAULTS,
    type DealMovementStateEntry,
    type DealMovementWork,
} from '@lib/sales-ai-analytics';
import {
    dealsNeedingWork,
    evaluateDealRows,
} from '../lib/deal-movement-rows.evaluation';
import type { DealMovementStageNorm } from '../lib/deal-movement-stage-norms';
import type { DealMovementCallRef } from '../types/deal-movement.types';
import { dealRow } from './deal-movement.fixture';

const NOW = '2026-11-17T23:30:00.000Z';
/** Прошлой ночью мы писали в ленту; до нас работа по сделке была 20.10. */
const NOTIFIED_AT = '2026-11-16T23:30:00.000Z';
const BEFORE_NOTE = '2026-10-20T09:00:00.000Z';

const previous = new Map<string, DealMovementStateEntry>([
    [
        '1',
        {
            status: 'stuck',
            notifiedStatus: 'stuck',
            reasons: ['stage_overdue'],
            stageCode: 'sales_pres',
            amount: 100_000,
            assignedById: 7,
            lastActivityAt: BEFORE_NOTE,
            changedAt: null,
            notifiedAt: NOTIFIED_AT,
            checkedAt: NOTIFIED_AT,
        },
    ],
]);

const oldCall: DealMovementCallRef = {
    transcriptionId: 't1',
    entityType: 'deal',
    entityId: 1,
    mainDealId: null,
    call: { at: '2026-10-25T10:00:00.000Z', progress: 3, nextStep: null },
};

/**
 * Сделка стоит в стадии с 15.10 (33 дня); «последняя активность» — из
 * Битрикса; дела Битрикса и сроки по истории — по желанию.
 */
const evaluate = (
    lastActivityAt: string,
    extra: {
        work?: ReadonlyMap<number, readonly DealMovementWork[]>;
        stageNorms?: ReadonlyMap<number, DealMovementStageNorm>;
    } = {},
) =>
    evaluateDealRows({
        rows: [
            dealRow(1, { movedAt: '2026-10-15T09:00:00.000Z', lastActivityAt }),
            dealRow(2),
        ],
        transitions: new Map(),
        calls: new Map([[1, [oldCall]]]),
        work: extra.work ?? new Map(),
        stageNorms: extra.stageNorms ?? new Map(),
        previous,
        now: NOW,
        thresholds: DEAL_MOVEMENT_DEFAULTS,
    });

/** Наша запись сдвинула LAST_ACTIVITY_TIME через 40 секунд после себя. */
const OWN_NOTE_ACTIVITY = '2026-11-16T23:30:40.000Z';

describe('оценка сделок ночи', () => {
    it('своя запись — не работа: сделка «без внимания», в состоянии прошлая активность', () => {
        const result = evaluate(OWN_NOTE_ACTIVITY);

        expect(result.verdicts.get('1')?.status).toBe('abandoned');
        expect(result.deals[0]?.lastActivityAt).toBe(BEFORE_NOTE);
        // Звонки и дела Битрикса читаем только у неё.
        expect(dealsNeedingWork(result.verdicts)).toEqual([1]);
    });

    it('чужая работа после нашей записи — работа есть: «без продвижения», а не «без внимания»', () => {
        const result = evaluate('2026-11-17T09:00:00.000Z');

        expect(result.verdicts.get('1')?.status).toBe('stuck');
        expect(result.deals[0]?.lastActivityAt).toBe(
            '2026-11-17T09:00:00.000Z',
        );
        expect(dealsNeedingWork(result.verdicts)).toEqual([]);
    });

    it('недозвон из дел Битрикса — работа: «без внимания» становится «без продвижения»', () => {
        const result = evaluate(OWN_NOTE_ACTIVITY, {
            work: new Map([
                [
                    1,
                    [
                        {
                            at: '2026-11-13T10:00:00.000Z',
                            kind: 'call',
                            missed: true,
                        },
                    ],
                ],
            ]),
        });

        expect(result.verdicts.get('1')).toMatchObject({
            status: 'stuck',
            facts: {
                recentWork: { callDays: ['2026-11-13'], callsMissed: true },
            },
        });
    });

    it('срок по истории портала — у своей ступени; у других ступеней — общий порог', () => {
        const norms = new Map([[4, { days: 40, episodes: 25 }]]);
        const result = evaluate(OWN_NOTE_ACTIVITY, { stageNorms: norms });

        // 33 дня в стадии при обычных 40 — ещё в сроке.
        expect(result.verdicts.get('1')).toMatchObject({
            status: 'moving',
            facts: { stageLimitDays: 40, stageLimitSource: 'history' },
        });
        const other = evaluate(OWN_NOTE_ACTIVITY, {
            stageNorms: new Map([[5, { days: 40, episodes: 25 }]]),
        });
        expect(other.verdicts.get('1')?.facts).toMatchObject({
            stageLimitDays: 21,
            stageLimitSource: 'default',
        });
    });

    it('звонки для «что сделать» — только у тревожных статусов с записью в ленту', () => {
        const result = evaluate('2026-11-17T09:00:00.000Z');

        expect(result.pointers.get('1')).toEqual({
            lastCall: { id: 't1', at: '2026-10-25T10:00:00.000Z' },
            lastAgreement: null,
        });
        expect(result.pointers.has('2')).toBe(false);
    });
});
