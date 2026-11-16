import {
    dealMovementVerdict,
    isDealMovementChanged,
} from '../deal-movement.status';
import {
    dealMovementLine,
    dealMovementReasonTexts,
} from '../deal-movement.texts';
import {
    DEAL_MOVEMENT_DEFAULTS,
    type DealMovementCall,
    type DealMovementDossier,
} from '../deal-movement.types';

/** Момент расчёта: 16.11.2026, ночь. */
const NOW = '2026-11-16T23:30:00.000Z';

/** День ноября 2026 в ISO; час — по умолчанию полдень. */
const at = (day: number, hour = 12): string =>
    `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;

const call = (
    day: number,
    fields: Partial<Omit<DealMovementCall, 'at'>> = {},
): DealMovementCall => ({
    at: at(day),
    progress: null,
    nextStep: null,
    ...fields,
});

/** Спокойная сделка: в стадии 5 дней, ничего не происходило. */
const dossier = (
    fields: Partial<DealMovementDossier> = {},
): DealMovementDossier => ({
    dealId: '9041',
    stageEnteredAt: at(11),
    transitions: [],
    stageNormDays: null,
    stageChance: null,
    amount: null,
    calls: [],
    closedActivitiesAt: [],
    forgotten: null,
    ...fields,
});

const verdictOf = (fields: Partial<DealMovementDossier> = {}) =>
    dealMovementVerdict(dossier(fields), NOW);

describe('статус сделки по досье', () => {
    it('спокойная сделка без событий — движется, тревожных признаков нет', () => {
        const verdict = verdictOf();

        expect(verdict).toMatchObject({
            dealId: '9041',
            status: 'moving',
            reasons: ['no_signals'],
        });
        expect(verdict.facts).toMatchObject({
            daysInStage: 5,
            stageLimitDays: 21,
        });
    });

    it('откатилась: стадия ушла назад за окно; старый откат и переход на ту же стадию не считаются', () => {
        expect(
            verdictOf({
                transitions: [{ at: at(10), fromOrder: 40, toOrder: 20 }],
            }),
        ).toMatchObject({ status: 'rolled_back', reasons: ['stage_back'] });

        expect(
            verdictOf({
                transitions: [
                    {
                        at: '2026-10-20T12:00:00.000Z',
                        fromOrder: 40,
                        toOrder: 20,
                    },
                    { at: at(10), fromOrder: 20, toOrder: 20 },
                ],
            }).status,
        ).toBe('moving');
    });

    it('застряла: в стадии дольше обычного срока портала и звонков за окно нет', () => {
        const stuck = verdictOf({
            stageEnteredAt: '2026-10-01T12:00:00.000Z',
            stageNormDays: 30,
        });
        expect(stuck).toMatchObject({
            status: 'stuck',
            reasons: ['stage_overdue'],
        });
        expect(stuck.facts).toMatchObject({
            daysInStage: 46,
            stageLimitDays: 30,
        });

        // Своего ряда портала мало — порог по умолчанию 21 день.
        expect(
            verdictOf({ stageEnteredAt: '2026-10-20T12:00:00.000Z' }).status,
        ).toBe('stuck');
        // Свежий звонок: сделкой занимаются, она не «застряла».
        expect(
            verdictOf({
                stageEnteredAt: '2026-10-01T12:00:00.000Z',
                calls: [call(12, { progress: 3 })],
            }).status,
        ).toBe('moving');
    });

    it('под риском: договорённость просрочена — дата прошла, контакта после неё не было', () => {
        const overdue = verdictOf({
            calls: [call(5, { nextStep: { set: true, date: '2026-11-10' } })],
        });
        expect(overdue).toMatchObject({
            status: 'at_risk',
            reasons: ['step_overdue'],
        });
        expect(overdue.facts.stepDate).toBe('2026-11-10');

        // Дата ещё не прошла.
        expect(
            verdictOf({
                calls: [
                    call(5, { nextStep: { set: true, date: '2026-11-20' } }),
                ],
            }).status,
        ).toBe('moving');
        // Вместо даты — слова: просрочку посчитать не из чего.
        expect(
            verdictOf({
                calls: [call(5, { nextStep: { set: true, date: 'в среду' } })],
            }).status,
        ).toBe('moving');
    });

    it('договорённость выполнена: звонок или закрытое дело в её день или позже', () => {
        const byCall = verdictOf({
            calls: [
                call(5, { nextStep: { set: true, date: '2026-11-10' } }),
                call(10),
            ],
        });
        expect(byCall).toMatchObject({
            status: 'moving',
            reasons: ['step_done'],
        });

        expect(
            verdictOf({
                calls: [
                    call(5, { nextStep: { set: true, date: '2026-11-10' } }),
                ],
                closedActivitiesAt: [at(11)],
            }).reasons,
        ).toEqual(['step_done']);
    });

    it('звонок, где договорились «на сегодня», сам выполнением не считается', () => {
        expect(
            verdictOf({
                calls: [
                    call(10, { nextStep: { set: true, date: '2026-11-10' } }),
                ],
            }),
        ).toMatchObject({ status: 'at_risk', reasons: ['step_overdue'] });
    });

    it('под риском: два последних звонка подряд ничего не изменили', () => {
        expect(
            verdictOf({
                calls: [
                    call(3, { progress: 4 }),
                    call(8, { progress: 1 }),
                    // Звонок без оценки продвижения серию не рвёт.
                    call(9),
                    call(12, { progress: 1 }),
                ],
            }),
        ).toMatchObject({ status: 'at_risk', reasons: ['progress_low_twice'] });

        expect(
            verdictOf({
                calls: [call(8, { progress: 1 }), call(12, { progress: 2 })],
            }).status,
        ).toBe('moving');
    });

    it('под риском: клиент согласился по звонку, а стадия стоит 12 дней и больше', () => {
        const still = verdictOf({
            stageEnteredAt: '2026-10-28T12:00:00.000Z',
            calls: [call(2, { progress: 4 })],
        });
        expect(still).toMatchObject({
            status: 'at_risk',
            reasons: ['agreed_but_still'],
        });
        expect(still.facts.daysSinceAgreed).toBe(14);

        // Стадия после согласия сдвинулась — противоречия нет.
        expect(
            verdictOf({
                stageEnteredAt: at(6),
                calls: [call(2, { progress: 5 })],
                transitions: [{ at: at(6), fromOrder: 30, toOrder: 40 }],
            }),
        ).toMatchObject({ status: 'moving', reasons: ['stage_forward'] });
        // Согласие свежее — ещё рано тревожиться.
        expect(verdictOf({ calls: [call(10, { progress: 4 })] }).status).toBe(
            'moving',
        );
    });

    it('под риском: крупная сделка на стадии с низкой вероятностью — только когда оба порога заданы', () => {
        const fields = { stageChance: 0.05, amount: 500_000 };

        expect(verdictOf(fields).status).toBe('moving');
        expect(
            dealMovementVerdict(dossier(fields), NOW, {
                ...DEAL_MOVEMENT_DEFAULTS,
                chanceMin: 0.1,
                amountMin: 300_000,
            }),
        ).toMatchObject({ status: 'at_risk', reasons: ['low_chance_big_sum'] });
        expect(
            dealMovementVerdict(dossier({ ...fields, amount: 100_000 }), NOW, {
                ...DEAL_MOVEMENT_DEFAULTS,
                chanceMin: 0.1,
                amountMin: 300_000,
            }).status,
        ).toBe('moving');
    });

    it('под риском: сделка в списке забытых аудита сделок; причины складываются', () => {
        expect(verdictOf({ forgotten: true })).toMatchObject({
            status: 'at_risk',
            reasons: ['forgotten'],
        });
        expect(verdictOf({ forgotten: false }).status).toBe('moving');

        expect(
            verdictOf({
                forgotten: true,
                calls: [
                    call(5, { nextStep: { set: true, date: '2026-11-10' } }),
                ],
            }).reasons,
        ).toEqual(['step_overdue', 'forgotten']);
    });

    it('порядок правил: откат важнее застоя, застой важнее риска', () => {
        expect(
            verdictOf({
                stageEnteredAt: '2026-10-01T12:00:00.000Z',
                forgotten: true,
                transitions: [{ at: at(10), fromOrder: 40, toOrder: 20 }],
            }).status,
        ).toBe('rolled_back');
        expect(
            verdictOf({
                stageEnteredAt: '2026-10-01T12:00:00.000Z',
                forgotten: true,
            }).status,
        ).toBe('stuck');
    });

    it('движется: стадия вперёд и последний звонок продвинул сделку', () => {
        expect(
            verdictOf({
                transitions: [{ at: at(11), fromOrder: 20, toOrder: 30 }],
                calls: [call(12, { progress: 3 })],
            }),
        ).toMatchObject({
            status: 'moving',
            reasons: ['stage_forward', 'progress_ok'],
        });
    });

    it('битые даты в досье расчёт не роняют', () => {
        expect(
            verdictOf({
                stageEnteredAt: 'не дата',
                calls: [{ at: 'мусор', progress: 1, nextStep: null }],
                transitions: [{ at: '', fromOrder: 40, toOrder: 20 }],
                closedActivitiesAt: ['???'],
            }),
        ).toMatchObject({ status: 'moving', reasons: ['no_signals'] });
    });

    it('смена статуса: первый расчёт и другой статус — смена, тот же — нет', () => {
        expect(isDealMovementChanged(null, 'moving')).toBe(true);
        expect(isDealMovementChanged('moving', 'at_risk')).toBe(true);
        expect(isDealMovementChanged('at_risk', 'at_risk')).toBe(false);
    });
});

describe('статус сделки словами', () => {
    it('причины — по-русски, с числами и датами, без кодов', () => {
        const overdue = verdictOf({
            calls: [call(5, { nextStep: { set: true, date: '2026-11-10' } })],
            forgotten: true,
        });
        expect(dealMovementReasonTexts(overdue)).toEqual([
            'договорились на 10.11 — контакта после этого не было',
            'сделка в списке забытых: по ней давно нет работы',
        ]);
        expect(dealMovementLine(overdue)).toBe(
            'Под риском: договорились на 10.11 — контакта после этого не было; сделка в списке забытых: по ней давно нет работы',
        );

        expect(
            dealMovementLine(
                verdictOf({
                    stageEnteredAt: '2026-10-01T12:00:00.000Z',
                    stageNormDays: 30,
                }),
            ),
        ).toBe(
            'Застряла: в стадии 46 дней при обычных 30, звонков за последнее время нет',
        );
        expect(
            dealMovementLine(
                verdictOf({
                    stageEnteredAt: '2026-10-28T12:00:00.000Z',
                    calls: [call(2, { progress: 4 })],
                }),
            ),
        ).toBe(
            'Под риском: клиент согласился по звонку, а стадия не меняется 14 дней',
        );
        expect(dealMovementLine(verdictOf())).toBe(
            'Движется: тревожных признаков нет',
        );
    });
});
