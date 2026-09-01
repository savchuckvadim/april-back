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
 * Ось «следующего события» на карточке клиента.
 *
 * Сценарий владельца: у клиента ДВА открытых дела — презентация 5-го и
 * звонок 3-го. Менеджер отчитывается по звонку 3-го и планирует новый
 * звонок на 7-е. Раньше в карточку уезжало:
 *  - «дата следующего звонка» = 7-е (хотя следующим будет 5-е);
 *  - «дата назначенной презентации» = пусто (хотя презентация назначена).
 * Теперь оба поля считаются по оси открытых дел.
 */
const NEXT_DATE = 'UF_CRM_CALL_NEXT_DATE';
const NEXT_NAME = 'UF_CRM_CALL_NEXT_NAME';
const PRES_DATE = 'UF_CRM_NEXT_PRES_PLAN_DATE';
const LAST_CALL = 'UF_CRM_CALL_LAST_DATE';
const LAST_PRES_PLAN = 'UF_CRM_LAST_PRES_PLAN_DATE';

const AXIS_CODES = new Set([
    'call_next_date',
    'call_next_name',
    'next_pres_plan_date',
    'call_last_date',
    'last_pres_plan_date',
]);

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'd.b24.ru' }),
    getEntityFieldByCode: (_entity: string, code: string) =>
        AXIS_CODES.has(code)
            ? { bitrixId: code.toUpperCase(), items: [] }
            : undefined,
});

/** Дела клиента, как их присылает фрейм (включая закрываемую задачу 100). */
const OPEN_TASKS = [
    {
        id: 100,
        eventType: 'warm',
        name: 'Звонок 3-го',
        deadline: '03.09.2026 10:00:00',
    },
    {
        id: 200,
        eventType: 'presentation',
        name: 'Презентация 5-го',
        deadline: '05.09.2026 12:00:00',
    },
];

/** План: звонок на 7-е. */
const PLAN_CALL_7 = {
    isPlanned: true,
    isActive: true,
    responsibility: { ID: 447 },
    type: { current: { code: 'warm' } },
    name: 'Звонок 7-го',
    deadline: '07.09.2026 11:00:00',
};

const makeCtx = (over: Record<string, unknown> = {}) =>
    new EventReportContext(
        {
            currentTask: { id: 100, eventType: 'warm', name: 'Звонок 3-го' },
            report: { resultStatus: 'result' },
            plan: PLAN_CALL_7,
            ...over,
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 7,
            company: { ID: '7' },
            currentPresDeal: null,
        } as never,
        new Date('2026-08-26T09:00:00.000Z'),
    );

type DealOptions = ConstructorParameters<
    typeof EventReportEntityFieldsModel
>[3];

const fieldsOf = (
    ctx: EventReportContext,
    entityType: (typeof EEventReportEntityType)[keyof typeof EEventReportEntityType] = EEventReportEntityType.COMPANY,
    dealOptions: DealOptions = null,
) =>
    new EventReportEntityFieldsModel(
        makePortal() as never,
        ctx,
        entityType,
        dealOptions,
    ).toFields();

describe('Ось следующего события — сценарий владельца (две открытые задачи)', () => {
    const ctx = () => makeCtx({ openTasks: OPEN_TASKS });

    it('«дата следующего звонка» — ближайшее дело (5-е), а не план (7-е)', () => {
        expect(fieldsOf(ctx())[NEXT_DATE]).toBe('05.09.2026 12:00:00');
    });

    it('«тема следующего звонка» описывает то же дело', () => {
        expect(fieldsOf(ctx())[NEXT_NAME]).toBe('Презентация 5-го');
    });

    it('«дата назначенной презентации» НЕ стирается отчётом по звонку', () => {
        expect(fieldsOf(ctx())[PRES_DATE]).toBe('05.09.2026 12:00:00');
    });

    it('«дата последнего звонка» остаётся слепой перезаписью «сейчас»', () => {
        expect(fieldsOf(ctx())[LAST_CALL]).toBe('26.08.2026 12:00:00');
    });

    it('закрываемая задача (звонок 3-го) на ось не попадает', () => {
        // Иначе ближайшим осталось бы 3-е — дата задачи, которую этот же
        // отчёт закрывает.
        expect(fieldsOf(ctx())[NEXT_DATE]).not.toBe('03.09.2026 10:00:00');
    });
});

describe('Ось следующего события — обратная совместимость', () => {
    it('фрейм список дел не прислал — прежнее поведение (дата плана)', () => {
        const out = fieldsOf(makeCtx());
        expect(out[NEXT_DATE]).toBe('07.09.2026 11:00:00');
        expect(out[NEXT_NAME]).toBe('Звонок 7-го');
        // Прежняя ветка обнуляла дату презентации при любом отчёте.
        expect(out[PRES_DATE]).toBeNull();
    });

    it('настройка портала выключена — прежнее поведение даже со списком', () => {
        const ctx = makeCtx({ openTasks: OPEN_TASKS });
        ctx.setFieldPolicySettings({
            calculatedNextEvent: false,
            resetOnFinal: true,
        });
        const out = fieldsOf(ctx);
        expect(out[NEXT_DATE]).toBe('07.09.2026 11:00:00');
        expect(out[PRES_DATE]).toBeNull();
    });

    it('список пуст, план есть — ось из одного плана, значение как раньше', () => {
        const out = fieldsOf(makeCtx({ openTasks: [] }));
        expect(out[NEXT_DATE]).toBe('07.09.2026 11:00:00');
        expect(out[NEXT_NAME]).toBe('Звонок 7-го');
    });
});

describe('Ось следующего события — обнуление', () => {
    /** Отказ без плана: работа с клиентом окончена. */
    const failCtx = () =>
        makeCtx({
            openTasks: OPEN_TASKS,
            report: {
                resultStatus: 'result',
                workStatus: { current: { code: 'fail' } },
            },
            plan: { isActive: false, responsibility: { ID: 447 } },
        });

    /*
     * ОБНУЛЕНИЕ — ПУСТОЙ СТРОКОЙ, А НЕ null (правка 01.09.2026).
     *
     * Раньше здесь ожидался null, и это закрепляло НЕРАБОТАЮЩЕЕ поведение:
     * сборщик batch-команды бэка выбрасывает null целиком, поэтому поле не
     * уезжало вовсе и настройка «Финал обнуляет даты следующего события»
     * (включена по умолчанию) на серверном пути не делала ничего. Пустая
     * строка — канон очистки в этом коде.
     */
    it('финал обнуляет всю ось, даже когда открытые дела остались', () => {
        const out = fieldsOf(failCtx());
        expect(out[NEXT_DATE]).toBe('');
        expect(out[NEXT_NAME]).toBe('');
        expect(out[PRES_DATE]).toBe('');
    });

    it('настройка «финал обнуляет» выключена — ось считается как обычно', () => {
        const ctx = failCtx();
        ctx.setFieldPolicySettings({
            calculatedNextEvent: true,
            resetOnFinal: false,
        });
        const out = fieldsOf(ctx);
        expect(out[NEXT_DATE]).toBe('05.09.2026 12:00:00');
    });

    /*
     * «Обнуление по уходу со стадии» отдельного правила не требует: клиент
     * ушёл с презентационной части воронки ровно тогда, когда у него не
     * осталось ни одной открытой презентации.
     */
    it('открытых презентаций не осталось — дата презентации обнуляется', () => {
        const out = fieldsOf(
            makeCtx({
                openTasks: [OPEN_TASKS[0]],
            }),
        );
        expect(out[PRES_DATE]).toBe('');
        // При этом звонок 7-го на оси есть — обнуляется только презентация.
        expect(out[NEXT_DATE]).toBe('07.09.2026 11:00:00');
    });

    it('дел не осталось вовсе и плана нет — ось обнуляется целиком', () => {
        const out = fieldsOf(
            makeCtx({
                openTasks: [],
                plan: { isActive: false, responsibility: { ID: 447 } },
            }),
        );
        expect(out[NEXT_DATE]).toBe('');
        expect(out[NEXT_NAME]).toBe('');
        expect(out[PRES_DATE]).toBe('');
    });
});

describe('Ось следующего события — план презентации', () => {
    /** Планируем презентацию на 10-е, а на 5-е уже назначена другая. */
    const ctx = () =>
        makeCtx({
            openTasks: OPEN_TASKS,
            plan: {
                isPlanned: true,
                isActive: true,
                responsibility: { ID: 447 },
                type: { current: { code: 'presentation' } },
                name: 'Презентация 10-го',
                deadline: '10.09.2026 12:00:00',
            },
        });

    it('в «дату назначенной презентации» уезжает РАННЯЯ из назначенных', () => {
        expect(fieldsOf(ctx())[PRES_DATE]).toBe('05.09.2026 12:00:00');
    });

    it('«дата последней НАЗНАЧЕННОЙ презентации» — штамп «сейчас», без расчёта', () => {
        // Поле отвечает на «когда презентацию назначили», а назначили сейчас.
        expect(fieldsOf(ctx())[LAST_PRES_PLAN]).toBe('26.08.2026 12:00:00');
    });

    /*
     * Pres-сделка — сам «элемент презентации»: поле на ней означает дату ЕЁ
     * презентации, а не ближайшей по клиенту. Гейт симметричен pres_count и
     * отметке «презентация проведена».
     */
    it('pres-сделка получает СВОЮ дату (10-е), а не ближайшую по клиенту', () => {
        const out = fieldsOf(ctx(), EEventReportEntityType.DEAL, {
            deal: null,
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: false,
        });
        expect(out[PRES_DATE]).toBe('10.09.2026 12:00:00');
        // Ось «следующего звонка» на pres-сделке считается как у всех.
        expect(out[NEXT_DATE]).toBe('05.09.2026 12:00:00');
    });

    it('основная сделка — клиентский носитель, считает по оси', () => {
        const out = fieldsOf(ctx(), EEventReportEntityType.DEAL, {
            deal: { ID: '100' },
            role: EDealRole.BASE,
        });
        expect(out[PRES_DATE]).toBe('05.09.2026 12:00:00');
    });
});

describe('Ось следующего события — перенос события', () => {
    /**
     * «Не очень»: тип плана не перевыбирают, задача остаётся той же и просто
     * уезжает на другую дату. Старая дата задачи на оси была бы призраком.
     */
    it('перенос звонка на 8-е: старая дата задачи не участвует', () => {
        const out = fieldsOf(
            makeCtx({
                openTasks: OPEN_TASKS,
                report: { resultStatus: 'noresult' },
                plan: {
                    isActive: true,
                    responsibility: { ID: 447 },
                    deadline: '08.09.2026 11:00:00',
                },
            }),
        );
        // Ближайшее — презентация 5-го; перенесённый звонок встал на 8-е.
        expect(out[NEXT_DATE]).toBe('05.09.2026 12:00:00');
        expect(out[NEXT_NAME]).toBe('Презентация 5-го');
    });

    it('перенос на дату РАНЬШЕ презентации — ближайшим становится он', () => {
        const out = fieldsOf(
            makeCtx({
                openTasks: OPEN_TASKS,
                report: { resultStatus: 'noresult' },
                plan: {
                    isActive: true,
                    responsibility: { ID: 447 },
                    deadline: '04.09.2026 11:00:00',
                },
            }),
        );
        expect(out[NEXT_DATE]).toBe('04.09.2026 11:00:00');
        expect(out[NEXT_NAME]).toBe('Звонок 3-го');
    });
});
