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
    stageOrder: null,
    lastActivityAt: null,
    transitions: [],
    stageNormDays: null,
    stageChance: null,
    amount: null,
    calls: [],
    closedActivitiesAt: [],
    work: [],
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
        // «Отправлены» (7) → «Доработка» (5).
        expect(
            verdictOf({
                stageOrder: 5,
                transitions: [{ at: at(10), fromOrder: 7, toOrder: 5 }],
            }),
        ).toMatchObject({ status: 'rolled_back', reasons: ['stage_back'] });

        expect(
            verdictOf({
                stageOrder: 5,
                transitions: [
                    {
                        at: '2026-10-20T12:00:00.000Z',
                        fromOrder: 7,
                        toOrder: 5,
                    },
                    { at: at(10), fromOrder: 5, toOrder: 5 },
                ],
            }).status,
        ).toBe('moving');
    });

    it('откат — ступень ниже самой высокой в окне: возврат на прежнюю ступень и переоткрытие откатом не считаются', () => {
        // Повторная заявка: «Отправлены» → «Новая» → обратно «Отправлены».
        expect(
            verdictOf({
                stageOrder: 7,
                transitions: [
                    { at: at(8), fromOrder: 7, toOrder: 1 },
                    { at: at(9), fromOrder: 1, toOrder: 7 },
                ],
            }).status,
        ).toBe('moving');
        // Реанимация: «Отказ» (12) → «Холодные» (2) — начинает заново и
        // продвижением стадии тоже не считается.
        expect(
            verdictOf({
                stageOrder: 2,
                transitions: [{ at: at(9), fromOrder: 12, toOrder: 2 }],
            }),
        ).toMatchObject({ status: 'moving', reasons: ['no_signals'] });
        // В окне: «Отправлены» → «Отказ» → переоткрыта в «Тёплые».
        expect(
            verdictOf({
                stageOrder: 3,
                transitions: [
                    { at: at(5), fromOrder: 7, toOrder: 12 },
                    { at: at(9), fromOrder: 12, toOrder: 3 },
                ],
            }).status,
        ).toBe('moving');
        // Текущая стадия вне лестницы — берётся стадия последнего перехода.
        expect(
            verdictOf({
                stageOrder: null,
                transitions: [{ at: at(10), fromOrder: 7, toOrder: 5 }],
            }).status,
        ).toBe('rolled_back');
        // Откат и снова вперёд, но не до прежней высоты — всё ещё откат.
        expect(
            verdictOf({
                stageOrder: 6,
                transitions: [
                    { at: at(8), fromOrder: 8, toOrder: 5 },
                    { at: at(9), fromOrder: 5, toOrder: 6 },
                ],
            }).status,
        ).toBe('rolled_back');
    });

    it('без внимания: в стадии дольше срока по истории портала, ни звонков, ни дел за окно', () => {
        const abandoned = verdictOf({
            stageEnteredAt: '2026-10-01T12:00:00.000Z',
            stageNormDays: 30,
        });
        expect(abandoned).toMatchObject({
            status: 'abandoned',
            reasons: ['no_work'],
        });
        expect(abandoned.facts).toMatchObject({
            daysInStage: 46,
            stageLimitDays: 30,
            stageLimitSource: 'history',
            // Последняя «работа» — вход в стадию.
            idleDays: 46,
            recentWork: null,
        });

        // Своего ряда портала мало — общий порог 21 день.
        const byDefault = verdictOf({
            stageEnteredAt: '2026-10-20T12:00:00.000Z',
        });
        expect(byDefault.status).toBe('abandoned');
        expect(byDefault.facts).toMatchObject({
            stageLimitDays: 21,
            stageLimitSource: 'default',
        });
    });

    it('граница срока: ровно срок — ещё не дольше, на день больше — дольше', () => {
        // 16.11 23:30 − 26.10 12:00 = 21 полный день.
        expect(
            verdictOf({ stageEnteredAt: '2026-10-26T12:00:00.000Z' }).status,
        ).toBe('moving');
        // 22 дня при пороге 21.
        expect(
            verdictOf({ stageEnteredAt: '2026-10-25T12:00:00.000Z' }).status,
        ).toBe('abandoned');
        // Срок по истории: 22 дня при обычных 22 — ещё нет.
        expect(
            verdictOf({
                stageEnteredAt: '2026-10-25T12:00:00.000Z',
                stageNormDays: 22,
            }).status,
        ).toBe('moving');
    });

    it('без продвижения: дольше срока, но недозвоны за окно — это работа', () => {
        const stuck = verdictOf({
            stageEnteredAt: '2026-10-01T12:00:00.000Z',
            stageNormDays: 34,
            work: [
                { at: at(13, 10), kind: 'call', missed: true },
                { at: at(16, 9), kind: 'call', missed: true },
            ],
        });
        expect(stuck).toMatchObject({
            status: 'stuck',
            reasons: ['stage_overdue'],
        });
        expect(stuck.facts.recentWork).toMatchObject({
            callDays: ['2026-11-13', '2026-11-16'],
            callsMissed: true,
        });
        expect(dealMovementReasonTexts(stuck)).toEqual([
            'звонки 13.11 и 16.11 (недозвоны), стадия не меняется 46 дней при обычных 34 днях для этой стадии',
        ]);
    });

    it('без продвижения: дело или задача за окно — работа; разобранный звонок — не недозвон', () => {
        const longInStage = { stageEnteredAt: '2026-10-01T12:00:00.000Z' };
        const activity = verdictOf({
            ...longInStage,
            work: [{ at: at(12), kind: 'activity', missed: false }],
        });
        expect(activity.status).toBe('stuck');
        expect(dealMovementReasonTexts(activity)[0]).toBe(
            'дело 12.11, стадия не меняется 46 дней при пороге 21 день',
        );

        const task = verdictOf({
            ...longInStage,
            work: [{ at: at(14), kind: 'task', missed: false }],
        });
        expect(task.status).toBe('stuck');
        expect(task.facts.recentWork?.taskDays).toEqual(['2026-11-14']);

        // Разобранный звонок и недозвон в один день — пометки «недозвон» нет.
        const mixed = verdictOf({
            ...longInStage,
            calls: [call(12, { progress: 3 })],
            work: [{ at: at(12, 15), kind: 'call', missed: true }],
        });
        expect(mixed.status).toBe('stuck');
        expect(dealMovementReasonTexts(mixed)[0]).toBe(
            'звонок 12.11, стадия не меняется 46 дней при пороге 21 день',
        );
    });

    it('работа старше окна — не работа: без внимания, «ни звонков, ни дел N дней»', () => {
        const old = verdictOf({
            stageEnteredAt: '2026-10-01T12:00:00.000Z',
            work: [
                { at: '2026-10-27T12:00:00.000Z', kind: 'call', missed: false },
            ],
        });
        expect(old.status).toBe('abandoned');
        expect(old.facts.idleDays).toBe(20);
        expect(dealMovementReasonTexts(old)).toEqual([
            'ни звонков, ни дел 20 дней; в стадии 46 дней при пороге 21 день',
        ]);

        // Дальше срока чтения дел — честно «больше N дней».
        const ancient = verdictOf({
            stageEnteredAt: '2026-03-01T12:00:00.000Z',
        });
        expect(dealMovementReasonTexts(ancient)).toEqual([
            'ни звонков, ни дел больше 60 дней; в стадии 260 дней при пороге 21 день',
        ]);
    });

    it('активность по сделке за окно — работа (разобраны не все звонки)', () => {
        const longInStage = { stageEnteredAt: '2026-10-01T12:00:00.000Z' };

        const active = verdictOf({ ...longInStage, lastActivityAt: at(12) });
        expect(active.status).toBe('stuck');
        expect(dealMovementReasonTexts(active)[0]).toBe(
            'активность в сделке 12.11, стадия не меняется 46 дней при пороге 21 день',
        );
        expect(
            verdictOf({
                ...longInStage,
                lastActivityAt: '2026-10-25T12:00:00.000Z',
            }).status,
        ).toBe('abandoned');
        expect(
            verdictOf({ ...longInStage, lastActivityAt: 'не дата' }).status,
        ).toBe('abandoned');
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
                transitions: [{ at: at(6), fromOrder: 3, toOrder: 4 }],
            }),
        ).toMatchObject({ status: 'moving', reasons: ['stage_forward'] });
        // Истории стадий нет (сдвиг был до окна), но вход в текущую стадию
        // позже звонка с согласием — стадия после согласия сдвинулась.
        expect(
            verdictOf({
                stageEnteredAt: '2026-10-30T12:00:00.000Z',
                calls: [
                    {
                        at: '2026-10-25T12:00:00.000Z',
                        progress: 5,
                        nextStep: null,
                    },
                ],
            }).reasons,
        ).not.toContain('agreed_but_still');
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

    it('порядок правил: возврат назад важнее срока стадии, срок стадии важнее риска', () => {
        expect(
            verdictOf({
                stageEnteredAt: '2026-10-01T12:00:00.000Z',
                forgotten: true,
                stageOrder: 5,
                transitions: [{ at: at(10), fromOrder: 7, toOrder: 5 }],
            }).status,
        ).toBe('rolled_back');
        expect(
            verdictOf({
                stageEnteredAt: '2026-10-01T12:00:00.000Z',
                forgotten: true,
            }).status,
        ).toBe('abandoned');
        expect(
            verdictOf({
                stageEnteredAt: '2026-10-01T12:00:00.000Z',
                calls: [
                    call(5, { nextStep: { set: true, date: '2026-11-10' } }),
                ],
            }).status,
        ).toBe('stuck');
    });

    it('движется: стадия вперёд и последний звонок продвинул сделку', () => {
        expect(
            verdictOf({
                transitions: [{ at: at(11), fromOrder: 2, toOrder: 3 }],
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
                transitions: [{ at: '', fromOrder: 7, toOrder: 5 }],
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
            'Без внимания: ни звонков, ни дел 46 дней; в стадии 46 дней при обычных 30 днях для этой стадии',
        );
        expect(
            dealMovementLine(
                verdictOf({
                    stageEnteredAt: '2026-10-01T12:00:00.000Z',
                    stageNormDays: 21,
                    work: [{ at: at(16), kind: 'call', missed: false }],
                }),
            ),
        ).toBe(
            'Без продвижения: звонок 16.11, стадия не меняется 46 дней при обычных 21 дне для этой стадии',
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
