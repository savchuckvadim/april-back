import { presentDealMovementHonesty } from '../deal-movement-honesty.presenter';
import { presentDealMovementMatrix } from '../deal-movement-matrix.presenter';
import { dealMovementScopeOf } from '../deal-movement-scope';
import { scoreBandOf } from '../deal-movement-vitrina.const';
import type { DealMovementPeriodSource } from '../deal-movement-vitrina.types';
import { call, CUP, night, OP } from './deal-movement.fixtures';

describe('матрица «оценка звонка × продвижение»', () => {
    it('полосы оценки: до 5 — низкая, до 8 — средняя, дальше — высокая', () => {
        expect(scoreBandOf(1)).toBe('low');
        expect(scoreBandOf(4.9)).toBe('low');
        expect(scoreBandOf(5)).toBe('mid');
        expect(scoreBandOf(7.9)).toBe('mid');
        expect(scoreBandOf(8)).toBe('high');
    });

    it('клетки по отделу и менеджеру; низкая оценка × 4–5 — «купил бы и без менеджера»', () => {
        const calls = [
            call('a', { score: 3, progress: 5 }),
            call('b', { score: 4.5, progress: 4 }),
            call('c', { score: 3, progress: 2 }),
            call('d', { score: 9, progress: 5, managerId: '512' }),
            call('e', { score: null, progress: 5 }),
            call('f', { score: 6, progress: 3, managerId: '900' }),
        ];

        const block = presentDealMovementMatrix({
            calls,
            scope: dealMovementScopeOf(OP, undefined),
            names: { '447': 'Иванова Анна' },
        });

        expect(block.department.n).toBe(4);
        expect(block.department.cells).toHaveLength(15);
        expect(block.noScore).toBe(1);
        const low5 = block.department.cells.find(
            item => item.scoreBand === 'low' && item.progress === 5,
        );
        expect(low5).toMatchObject({
            count: 1,
            flag: 'buy_anyway',
            flagTitle: 'клиент купил бы и без менеджера',
        });
        const low2 = block.department.cells.find(
            item => item.scoreBand === 'low' && item.progress === 2,
        );
        expect(low2).toMatchObject({ count: 1, flag: null });
        expect(block.department.buyAnyway).toBe(2);
        expect(block.managers.map(item => item.managerId)).toEqual([
            '447',
            '512',
        ]);
        expect(block.managers[0]).toMatchObject({
            managerName: 'Иванова Анна',
            n: 3,
            buyAnyway: 2,
        });
    });

    it('мало звонков — число есть, плюс пометка', () => {
        const block = presentDealMovementMatrix({
            calls: [call('a', { score: 9, progress: 5 })],
            scope: dealMovementScopeOf(CUP, undefined),
            names: {},
        });

        expect(block.department).toMatchObject({
            n: 1,
            fewCalls: true,
            note: 'мало звонков',
        });
    });
});

describe('честность оценок продвижения', () => {
    /** Сборка 20.11; срок проверки 12 дней. */
    const source = (
        fields: Partial<DealMovementPeriodSource>,
    ): DealMovementPeriodSource => ({
        from: '2026-11-01',
        to: '2026-11-20',
        today: '2026-11-20',
        builtAt: '2026-11-20T09:00:00.000Z',
        nights: [],
        calls: [],
        ...fields,
    });

    it('сдвинулась / не сдвинулась за 12 дней, ждут проверки и не проверены', () => {
        const result = presentDealMovementHonesty({
            source: source({
                nights: [
                    night('2026-11-15', {
                        progressChecks: [
                            {
                                transcriptionId: 'still',
                                dealId: '1',
                                at: '2026-11-02T10:00:00.000Z',
                                progress: 5,
                                outcome: 'still',
                            },
                            {
                                transcriptionId: 'moved',
                                dealId: '2',
                                at: '2026-11-03T10:00:00.000Z',
                                progress: 4,
                                outcome: 'moved',
                            },
                        ],
                    }),
                ],
                calls: [
                    call('still', { at: '2026-11-02T10:00:00.000Z' }),
                    call('moved', { at: '2026-11-03T10:00:00.000Z' }),
                    // 12 дней не прошли
                    call('pending', { at: '2026-11-15T10:00:00.000Z' }),
                    // прошли, а отметки нет
                    call('lost', { at: '2026-11-04T10:00:00.000Z' }),
                    // продвижение 3 — не проверяется
                    call('low', { progress: 3 }),
                ],
            }),
            scope: dealMovementScopeOf(CUP, undefined),
            names: {},
        });

        expect(result.checkDays).toBe(12);
        expect(result.progressMin).toBe(4);
        expect(result.department).toMatchObject({
            highProgress: 4,
            checked: 2,
            still: 1,
            moved: 1,
            pending: 1,
            unchecked: 1,
            stillPct: 50,
            fewCalls: true,
            note: 'мало звонков',
        });
    });

    it('«сдвинулась» в любой ночи окончательна; периметр отсекает чужих', () => {
        const check = (outcome: 'moved' | 'still') => ({
            transcriptionId: 'x',
            dealId: '1',
            at: '2026-11-02T10:00:00.000Z',
            progress: 4,
            outcome,
        });
        const calls = Array.from({ length: 10 }, (_, index) =>
            call(index === 0 ? 'x' : `s${index}`, {
                at: '2026-11-02T10:00:00.000Z',
            }),
        );
        const stillChecks = calls.slice(1).map(item => ({
            ...check('still'),
            transcriptionId: item.transcriptionId,
        }));

        const result = presentDealMovementHonesty({
            source: source({
                nights: [
                    night('2026-11-10', {
                        progressChecks: [check('moved'), ...stillChecks],
                    }),
                    night('2026-11-14', { progressChecks: [check('still')] }),
                ],
                calls: [...calls, call('alien', { managerId: '900' })],
            }),
            scope: dealMovementScopeOf(OP, undefined),
            names: {},
        });

        expect(result.department).toMatchObject({
            highProgress: 10,
            checked: 10,
            moved: 1,
            still: 9,
            stillPct: 90,
            fewCalls: false,
            note: null,
        });
        expect(result.managers.map(item => item.managerId)).toEqual(['447']);
    });

    it('проверок ещё нет — доля null, срок по умолчанию', () => {
        const result = presentDealMovementHonesty({
            source: source({
                nights: [night('2026-11-18', { progressCheckDays: null })],
                calls: [call('a', { at: '2026-11-02T10:00:00.000Z' })],
            }),
            scope: dealMovementScopeOf(CUP, undefined),
            names: {},
        });

        expect(result.checkDays).toBe(12);
        expect(result.department).toMatchObject({
            checked: 0,
            unchecked: 1,
            stillPct: null,
        });
    });
});
