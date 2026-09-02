import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../services/entity/event-report-entity-fields.model';
import { EventReportContext } from '../services/context/event-report.context';
import { EEventReportEntityType } from '../services/init/event-report-init.types';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Состояние «на доработке» — три deal-only поля основной сделки.
 *
 * Таблица переходов (решения владельца 02.09.2026):
 *  - вход: план «Доработка» / перенос задачи «Доработка» → флаг 1, дата
 *    входа, причина только в пустое поле;
 *  - выход: планы «Решение»/«Оплата»/«Поставка», холодный план, финал →
 *    0 / '' / '';
 *  - не трогают: «Документы», «Звонок», «Презентация», отчёт без плана;
 *  - обнуляющее событие без состояния → ни одной команды.
 */
const FLAG = 'UF_CRM_OP_IS_IN_REFINE';
const AT = 'UF_CRM_OP_REFINED_AT';
const REASON = 'UF_CRM_OP_REFINED_REASON';
const OBJECTION = 'UF_CRM_OP_OBJECTION_REASON';
const OBJECTION_COMMENT = 'UF_CRM_OP_OBJECTION_COMMENT';

const OBJECTION_ITEMS = [
    { code: 'op_objection_nomoney', name: 'op_objection_nomoney', title: 'Нет денег', bitrixId: 101 },
    { code: 'op_objection_lpr', name: 'op_objection_lpr', title: 'ЛПР против', bitrixId: 102 },
    { code: 'op_objection_none', name: 'op_objection_none', title: 'Нет возражений', bitrixId: 103 },
];

const FIELDS: Record<string, { bitrixId: string; items: unknown[] }> = {
    op_is_in_refine: { bitrixId: 'OP_IS_IN_REFINE', items: [] },
    op_refined_at: { bitrixId: 'OP_REFINED_AT', items: [] },
    op_refined_reason: { bitrixId: 'OP_REFINED_REASON', items: [] },
    op_objection_reason: { bitrixId: 'OP_OBJECTION_REASON', items: OBJECTION_ITEMS },
    op_objection_comment: { bitrixId: 'OP_OBJECTION_COMMENT', items: [] },
};

const SALES_BASE_CATEGORY_ID = 17;

const makePortal = (installed: string[] = Object.keys(FIELDS)) => ({
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'd.b24.ru' }),
    getEntityFieldByCode: (_entity: string, code: string) =>
        installed.includes(code) ? FIELDS[code] : undefined,
    getDealCategoryByCode: (code: string) =>
        code === 'sales_base'
            ? { bitrixId: SALES_BASE_CATEGORY_ID, code, stages: [] }
            : undefined,
});

/** «Сегодня» — 02.09.2026 12:00 по Москве. */
const NOW = new Date('2026-09-02T09:00:00.000Z');
const TODAY = '02.09.2026';

const plan = (code: string) => ({
    isPlanned: true,
    isActive: true,
    responsibility: { ID: 447 },
    type: { current: { code } },
    name: `План ${code}`,
    deadline: '05.09.2026 11:00:00',
});

const NO_PLAN = { isActive: false, responsibility: { ID: 447 } };

const makeCtx = (
    over: Record<string, unknown> = {},
    init: Record<string, unknown> = {},
) =>
    new EventReportContext(
        {
            currentTask: { id: 100, eventType: 'warm', name: 'Звонок' },
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'inJob' } },
                description: '',
            },
            plan: NO_PLAN,
            ...over,
        } as never,
        makePortal() as never,
        {
            entityType: 'deal',
            entityId: 500,
            company: null,
            lead: null,
            currentPresDeal: null,
            ...init,
        } as never,
        NOW,
    );

/** Строка основной сделки; состояние по умолчанию пустое. */
const dealRow = (over: Record<string, unknown> = {}) => ({
    ID: '500',
    CATEGORY_ID: String(SALES_BASE_CATEGORY_ID),
    [FLAG]: '0',
    [AT]: '',
    [REASON]: '',
    ...over,
});

const IN_STATE = {
    [FLAG]: '1',
    [AT]: '20.08.2026',
    [REASON]: 'старая причина',
};

const fieldsOf = (
    ctx: EventReportContext,
    deal: Record<string, unknown> | null = dealRow(),
    role: (typeof EDealRole)[keyof typeof EDealRole] = EDealRole.BASE,
    portal = makePortal(),
) =>
    new EventReportEntityFieldsModel(
        portal as never,
        ctx,
        EEventReportEntityType.DEAL,
        { deal, role },
    ).toFields();

const stateOf = (out: Record<string, unknown>) => ({
    flag: out[FLAG],
    at: out[AT],
    reason: out[REASON],
});

describe('Состояние «на доработке» — вход', () => {
    it('план «Доработка» без состояния: 1 / сегодня / причина из возражений', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow({
                [OBJECTION]: ['101', '102'],
                [OBJECTION_COMMENT]: 'дорого',
            }),
        );
        expect(stateOf(out)).toEqual({
            flag: 1,
            at: TODAY,
            reason: 'Нет денег, ЛПР против — «дорого»',
        });
    });

    it('уже на доработке: повторный план ничего не двигает', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow({ ...IN_STATE, [OBJECTION]: ['101'] }),
        );
        expect(stateOf(out)).toEqual({
            flag: undefined,
            at: undefined,
            reason: undefined,
        });
    });

    it('набранная менеджером причина не перекрывается возражениями', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow({ [REASON]: 'моя формулировка', [OBJECTION]: ['101'] }),
        );
        expect(out[FLAG]).toBe(1);
        expect(out[REASON]).toBeUndefined();
    });

    it('флаг стоит, а дата и причина пусты — дописываются', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow({ [FLAG]: '1', [OBJECTION]: ['102'] }),
        );
        expect(stateOf(out)).toEqual({
            flag: undefined,
            at: TODAY,
            reason: 'ЛПР против',
        });
    });

    it('возражений нет — причина из комментария отчёта', () => {
        const out = fieldsOf(
            makeCtx({
                plan: plan('refine'),
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'inJob' } },
                    description: 'ждут бюджет',
                },
            }),
        );
        expect(out[REASON]).toBe('ждут бюджет');
    });

    it('«Нет возражений» + формулировка — причина из формулировки', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow({ [OBJECTION]: ['103'], [OBJECTION_COMMENT]: 'дорого' }),
        );
        expect(out[REASON]).toBe('«дорого»');
    });

    it('причина уезжает экранированной для batch-провода', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow({ [OBJECTION_COMMENT]: 'цена & сроки' }),
        );
        expect(out[REASON]).toBe('«цена %26 сроки»');
    });

    it('возражение только на компании — берётся с компании', () => {
        const out = fieldsOf(
            makeCtx(
                { plan: plan('refine') },
                { company: { ID: '7', [OBJECTION]: ['101'] } },
            ),
        );
        expect(out[REASON]).toBe('Нет денег');
    });

    it('план «Доработка» без дедлайна — всё равно вход', () => {
        const out = fieldsOf(
            makeCtx({ plan: { ...plan('refine'), deadline: '' } }),
        );
        expect(out[FLAG]).toBe(1);
        expect(out[AT]).toBe(TODAY);
    });

    it('новая основная сделка (строки нет) + план «Доработка» — вход', () => {
        const out = fieldsOf(
            makeCtx({
                plan: plan('refine'),
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'inJob' } },
                    description: 'первый контакт',
                },
            }),
            null,
        );
        expect(stateOf(out)).toEqual({
            flag: 1,
            at: TODAY,
            reason: 'первый контакт',
        });
    });
});

describe('Состояние «на доработке» — перенос задачи', () => {
    /** Перенос: план активен, тип плана не выбран, статус результата — не результат. */
    const transfer = (over: Record<string, unknown> = {}) =>
        makeCtx({
            currentTask: { id: 100, eventType: 'refine', name: 'Доработка' },
            report: { resultStatus: 'noresult', description: 'недозвон' },
            plan: {
                isActive: true,
                responsibility: { ID: 447 },
                deadline: '05.09.2026 11:00:00',
            },
            ...over,
        });

    it('перенос «Доработки» без состояния: флаг и дата, причина — не из комментария', () => {
        const out = fieldsOf(transfer());
        expect(stateOf(out)).toEqual({
            flag: 1,
            at: TODAY,
            reason: undefined,
        });
    });

    it('перенос с возражениями на сделке — причина из возражений', () => {
        const out = fieldsOf(transfer(), dealRow({ [OBJECTION]: ['101'] }));
        expect(out[REASON]).toBe('Нет денег');
    });

    it('перенос уже на доработке — ничего не двигает', () => {
        const out = fieldsOf(transfer(), dealRow(IN_STATE));
        expect(stateOf(out)).toEqual({
            flag: undefined,
            at: undefined,
            reason: undefined,
        });
    });
});

describe('Состояние «на доработке» — не трогают', () => {
    it.each(['warm', 'presentation', 'document'])(
        'план %s при состоянии — без команд',
        code => {
            const out = fieldsOf(makeCtx({ plan: plan(code) }), dealRow(IN_STATE));
            expect(stateOf(out)).toEqual({
                flag: undefined,
                at: undefined,
                reason: undefined,
            });
        },
    );

    it('отчёт по доработке без плана — без команд', () => {
        const out = fieldsOf(
            makeCtx({
                currentTask: { id: 100, eventType: 'refine', name: 'Доработка' },
            }),
            dealRow(IN_STATE),
        );
        expect(stateOf(out)).toEqual({
            flag: undefined,
            at: undefined,
            reason: undefined,
        });
    });

    it('холодный ОТЧЁТ без плана — без команд', () => {
        const out = fieldsOf(
            makeCtx({
                currentTask: { id: 100, eventType: 'xo', name: 'ХО' },
            }),
            dealRow(IN_STATE),
        );
        expect(out[FLAG]).toBeUndefined();
    });
});

describe('Состояние «на доработке» — выход', () => {
    const CLEARED = { flag: 0, at: '', reason: '' };

    it.each(['hot', 'moneyAwait', 'supply'])(
        'план %s снимает состояние: 0 / пусто / пусто',
        code => {
            const out = fieldsOf(makeCtx({ plan: plan(code) }), dealRow(IN_STATE));
            expect(stateOf(out)).toEqual(CLEARED);
        },
    );

    it.each(['xo', 'xoRequest', 'xoLead'])(
        'холодный план %s снимает состояние',
        code => {
            const out = fieldsOf(makeCtx({ plan: plan(code) }), dealRow(IN_STATE));
            expect(stateOf(out)).toEqual(CLEARED);
        },
    );

    it('отказ снимает состояние', () => {
        const out = fieldsOf(
            makeCtx({
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'fail' } },
                },
            }),
            dealRow(IN_STATE),
        );
        expect(stateOf(out)).toEqual(CLEARED);
    });

    it('продажа снимает состояние', () => {
        const out = fieldsOf(
            makeCtx({
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'success' } },
                },
            }),
            dealRow(IN_STATE),
        );
        expect(stateOf(out)).toEqual(CLEARED);
    });

    it('финал сильнее плана «Доработка»', () => {
        const out = fieldsOf(
            makeCtx({
                plan: plan('refine'),
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'fail' } },
                },
            }),
            dealRow(IN_STATE),
        );
        expect(stateOf(out)).toEqual(CLEARED);
    });

    it('финал без состояния — ни одной команды', () => {
        const out = fieldsOf(
            makeCtx({
                plan: plan('refine'),
                report: {
                    resultStatus: 'result',
                    workStatus: { current: { code: 'fail' } },
                },
            }),
        );
        expect(stateOf(out)).toEqual({
            flag: undefined,
            at: undefined,
            reason: undefined,
        });
    });

    it('план «Решение» без состояния — ни одной команды', () => {
        const out = fieldsOf(makeCtx({ plan: plan('hot') }));
        expect(out[FLAG]).toBeUndefined();
    });

    it('после снятия повторный план «Доработка» ставит новую дату', () => {
        // Сделка после выхода: флаг снят, дата пуста.
        const out = fieldsOf(makeCtx({ plan: plan('refine') }), dealRow());
        expect(out[AT]).toBe(TODAY);
    });
});

describe('Состояние «на доработке» — носитель', () => {
    it('pres-сделка полей не получает', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow(),
            EDealRole.PRESENTATION,
        );
        expect(out[FLAG]).toBeUndefined();
    });

    it('роль base с чужой воронкой (owner-сделка плейсмента) — пропуск', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow({ CATEGORY_ID: '48' }),
        );
        expect(out[FLAG]).toBeUndefined();
    });

    it('поля не установлены — ни одного обращения к категориям', () => {
        const portal = makePortal([]);
        const spy = jest.spyOn(portal, 'getDealCategoryByCode');
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow(),
            EDealRole.BASE,
            portal,
        );
        expect(out[FLAG]).toBeUndefined();
        expect(spy).not.toHaveBeenCalled();
    });

    it('установлен только флаг — пишется только он', () => {
        const out = fieldsOf(
            makeCtx({ plan: plan('refine') }),
            dealRow(),
            EDealRole.BASE,
            makePortal(['op_is_in_refine']),
        );
        expect(stateOf(out)).toEqual({
            flag: 1,
            at: undefined,
            reason: undefined,
        });
    });

    it('компания полей состояния не получает', () => {
        const out = new EventReportEntityFieldsModel(
            makePortal() as never,
            makeCtx({ plan: plan('refine') }, { company: { ID: '7' } }),
            EEventReportEntityType.COMPANY,
            null,
        ).toFields();
        expect(out[FLAG]).toBeUndefined();
    });
});
