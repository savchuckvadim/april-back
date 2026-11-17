import {
    DEAL_MOVEMENT_DEFAULTS,
    type DealMovementStateEntry,
} from '@lib/sales-ai-analytics';
import { evaluateDealRows } from '../lib/deal-movement-rows.evaluation';
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

/** Сделка стоит в стадии с 15.10; «последняя активность» — из Битрикса. */
const evaluate = (lastActivityAt: string) =>
    evaluateDealRows({
        rows: [
            dealRow(1, { movedAt: '2026-10-15T09:00:00.000Z', lastActivityAt }),
            dealRow(2),
        ],
        transitions: new Map(),
        calls: new Map([[1, [oldCall]]]),
        previous,
        now: NOW,
        thresholds: DEAL_MOVEMENT_DEFAULTS,
    });

describe('оценка сделок ночи', () => {
    it('своя запись — не активность: «застряла» остаётся, в состоянии прошлая активность', () => {
        // Наша запись сдвинула LAST_ACTIVITY_TIME через 40 секунд после себя.
        const result = evaluate('2026-11-16T23:30:40.000Z');

        expect(result.verdicts.get('1')?.status).toBe('stuck');
        expect(result.deals[0]?.lastActivityAt).toBe(BEFORE_NOTE);
    });

    it('чужая работа после нашей записи — сделка больше не «застряла»', () => {
        const result = evaluate('2026-11-17T09:00:00.000Z');

        expect(result.verdicts.get('1')?.status).not.toBe('stuck');
        expect(result.deals[0]?.lastActivityAt).toBe(
            '2026-11-17T09:00:00.000Z',
        );
    });

    it('звонки для «что сделать» — только у тревожных статусов', () => {
        const result = evaluate('2026-11-16T23:30:40.000Z');

        expect(result.pointers.get('1')).toEqual({
            lastCall: { id: 't1', at: '2026-10-25T10:00:00.000Z' },
            lastAgreement: null,
        });
        expect(result.pointers.has('2')).toBe(false);
    });
});
