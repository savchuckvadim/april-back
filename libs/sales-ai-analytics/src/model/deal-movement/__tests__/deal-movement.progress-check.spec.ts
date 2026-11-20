import {
    checkDealMovementProgress,
    type DealMovementProgressDeal,
} from '../deal-movement.progress-check';

/** Ночь 20.11, 02:30 МСК. */
const NOW = '2026-11-19T23:30:00.000Z';
const OPTIONS = { now: NOW, checkDays: 12 };

const deal = (
    fields: Partial<DealMovementProgressDeal> = {},
): DealMovementProgressDeal => ({
    dealId: '9041',
    stageEnteredAt: '2026-10-01T09:00:00.000Z',
    transitions: null,
    calls: [],
    ...fields,
});

describe('проверка продвижения звонка: стадия за 12 дней', () => {
    it('стадия не менялась после звонка 4–5, 12 дней прошли — «не сдвинулась»', () => {
        const checks = checkDealMovementProgress(
            deal({
                calls: [
                    {
                        transcriptionId: 't1',
                        at: '2026-11-05T10:00:00.000Z',
                        progress: 5,
                    },
                ],
            }),
            OPTIONS,
        );

        expect(checks).toEqual([
            {
                transcriptionId: 't1',
                dealId: '9041',
                at: '2026-11-05T10:00:00.000Z',
                progress: 5,
                outcome: 'still',
            },
        ]);
    });

    it('переход вперёд в пределах 12 дней — «сдвинулась», даже до срока', () => {
        const checks = checkDealMovementProgress(
            deal({
                stageEnteredAt: '2026-11-18T12:00:00.000Z',
                transitions: [
                    {
                        at: '2026-11-18T12:00:00.000Z',
                        fromOrder: 4,
                        toOrder: 6,
                    },
                ],
                calls: [
                    {
                        transcriptionId: 't2',
                        at: '2026-11-17T10:00:00.000Z',
                        progress: 4,
                    },
                ],
            }),
            OPTIONS,
        );

        expect(checks.map(check => check.outcome)).toEqual(['moved']);
    });

    it('переход назад или позже срока — «не сдвинулась»', () => {
        const checks = checkDealMovementProgress(
            deal({
                stageEnteredAt: '2026-11-19T08:00:00.000Z',
                transitions: [
                    // назад в пределах срока
                    {
                        at: '2026-11-03T10:00:00.000Z',
                        fromOrder: 6,
                        toOrder: 4,
                    },
                    // вперёд, но через 18 дней после звонка
                    {
                        at: '2026-11-19T08:00:00.000Z',
                        fromOrder: 4,
                        toOrder: 6,
                    },
                ],
                calls: [
                    {
                        transcriptionId: 't3',
                        at: '2026-11-01T10:00:00.000Z',
                        progress: 4,
                    },
                ],
            }),
            OPTIONS,
        );

        expect(checks.map(check => check.outcome)).toEqual(['still']);
    });

    it('12 дней не прошли и перехода нет — звонок не отмечается', () => {
        const checks = checkDealMovementProgress(
            deal({
                calls: [
                    {
                        transcriptionId: 't4',
                        at: '2026-11-15T10:00:00.000Z',
                        progress: 5,
                    },
                ],
            }),
            OPTIONS,
        );

        expect(checks).toEqual([]);
    });

    it('стадия менялась после звонка, а истории нет — проверить нечем', () => {
        const checks = checkDealMovementProgress(
            deal({
                stageEnteredAt: '2026-11-06T10:00:00.000Z',
                transitions: null,
                calls: [
                    {
                        transcriptionId: 't5',
                        at: '2026-11-04T10:00:00.000Z',
                        progress: 4,
                    },
                ],
            }),
            OPTIONS,
        );

        expect(checks).toEqual([]);
    });

    it('продвижение ниже 4, без продвижения и старше срока с запасом — не отмечаются', () => {
        const checks = checkDealMovementProgress(
            deal({
                calls: [
                    {
                        transcriptionId: 'low',
                        at: '2026-11-05T10:00:00.000Z',
                        progress: 3,
                    },
                    {
                        transcriptionId: 'none',
                        at: '2026-11-05T10:00:00.000Z',
                        progress: null,
                    },
                    {
                        transcriptionId: 'old',
                        at: '2026-10-20T10:00:00.000Z',
                        progress: 5,
                    },
                ],
            }),
            OPTIONS,
        );

        expect(checks).toEqual([]);
    });
});
