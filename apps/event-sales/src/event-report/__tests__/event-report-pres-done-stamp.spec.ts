import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../services/entity/event-report-entity-fields.model';
import { EventReportContext } from '../services/context/event-report.context';
import { EEventReportEntityType } from '../services/init/event-report-init.types';
import { EVENT_TASK_CHECKLIST_ITEM } from '../services/task/event-task-checklist.catalog';

// В рантайме плагины dayjs расширяются при импорте @lib/shared/lib/date.
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * `last_pres_done_date` / `last_pres_done_responsible` — «последняя
 * ПРОВЕДЁННАЯ презентация».
 *
 * Для pres-сделки поле означает её собственную презентацию: сделка и есть
 * «элемент презентации». Плановая pres-сделка, создаваемая ЭТИМ ЖЕ отчётом,
 * презентации не видела — раньше она рождалась с отметкой «проведена
 * сейчас», и отличить проведённую презентацию от назначенной по полю было
 * нельзя. Гейт симметричен `pres_count` и переносу анкеты.
 */
const DONE_DATE = 'UF_CRM_LAST_PRES_DONE_DATE';
const DONE_RESPONSIBLE = 'UF_CRM_LAST_PRES_DONE_RESPONSIBLE';

const makePortal = () => ({
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain: 'd.b24.ru' }),
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'last_pres_done_date' || code === 'last_pres_done_responsible'
            ? { bitrixId: code.toUpperCase(), items: [] }
            : undefined,
});

const makeCtx = (over: Record<string, unknown> = {}) =>
    new EventReportContext(
        {
            currentTask: { eventType: 'presentation', name: 'ООО Ромашка' },
            report: { resultStatus: 'result' },
            plan: { responsibility: { ID: 447 } },
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
    entityType: (typeof EEventReportEntityType)[keyof typeof EEventReportEntityType],
    dealOptions: DealOptions = null,
) =>
    new EventReportEntityFieldsModel(
        makePortal() as never,
        ctx,
        entityType,
        dealOptions,
    ).toFields();

/** Чек-лист закрываемой задачи с отмеченным «Презентация проведена». */
const withPresentationChecked = (ctx: EventReportContext) => {
    ctx.setTaskChecklist({
        taskId: 900,
        items: [
            {
                code: EVENT_TASK_CHECKLIST_ITEM.presentationDone,
                title: 'Презентация проведена',
                done: true,
            },
        ],
        extra: [],
    });
    return ctx;
};

describe('«Последняя проведённая презентация» — отчёт по презентации', () => {
    const doneCtx = () =>
        makeCtx({
            presentation: { isPresentationDone: true },
            plan: {
                isPlanned: true,
                isActive: true,
                responsibility: { ID: 447 },
                type: { current: { code: 'presentation' } },
            },
        });

    it('компания получает отметку: по клиенту презентация только что была', () => {
        const out = fieldsOf(doneCtx(), EEventReportEntityType.COMPANY);
        expect(out[DONE_DATE]).toBe('26.08.2026 12:00:00');
        expect(out[DONE_RESPONSIBLE]).toBe(447);
    });

    it('pres-сделка, на которой презентация состоялась, — отметка есть', () => {
        const out = fieldsOf(doneCtx(), EEventReportEntityType.DEAL, {
            deal: { ID: '900' },
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: true,
        });
        expect(out[DONE_DATE]).toBe('26.08.2026 12:00:00');
    });

    /*
     * Штатный сценарий: отчитались по презентации И тут же запланировали
     * следующую. Новая плановая pres-сделка не должна родиться с датой
     * «презентация проведена сейчас».
     */
    it('ПЛАНОВАЯ pres-сделка того же отчёта отметки НЕ получает', () => {
        const out = fieldsOf(doneCtx(), EEventReportEntityType.DEAL, {
            deal: null,
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: false,
        });
        expect(DONE_DATE in out).toBe(false);
        expect(DONE_RESPONSIBLE in out).toBe(false);
    });

    it('основная сделка — вне гейта: «последняя проведённая» по клиенту', () => {
        const out = fieldsOf(doneCtx(), EEventReportEntityType.DEAL, {
            deal: { ID: '100' },
            role: EDealRole.BASE,
            presentationHappenedHere: false,
        });
        expect(out[DONE_DATE]).toBe('26.08.2026 12:00:00');
    });
});

describe('«Последняя проведённая презентация» — фолбэк по чек-листу задачи', () => {
    /** Кнопку «презентация проведена» не нажали, но галка в задаче стоит. */
    const checklistCtx = () =>
        withPresentationChecked(
            makeCtx({
                plan: {
                    isPlanned: true,
                    isActive: true,
                    responsibility: { ID: 447 },
                    type: { current: { code: 'presentation' } },
                },
            }),
        );

    it('компания получает отметку по галке чек-листа', () => {
        const out = fieldsOf(checklistCtx(), EEventReportEntityType.COMPANY);
        expect(out[DONE_DATE]).toBe('26.08.2026 12:00:00');
        expect(out[DONE_RESPONSIBLE]).toBe(447);
    });

    it('ПЛАНОВАЯ pres-сделка отметки по галке НЕ получает', () => {
        const out = fieldsOf(checklistCtx(), EEventReportEntityType.DEAL, {
            deal: null,
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: false,
        });
        expect(DONE_DATE in out).toBe(false);
        expect(DONE_RESPONSIBLE in out).toBe(false);
    });

    it('pres-сделка с состоявшейся презентацией отметку получает', () => {
        const out = fieldsOf(checklistCtx(), EEventReportEntityType.DEAL, {
            deal: { ID: '900' },
            role: EDealRole.PRESENTATION,
            presentationHappenedHere: true,
        });
        expect(out[DONE_DATE]).toBe('26.08.2026 12:00:00');
    });

    it('галки нет — отметки нет ни у кого', () => {
        const out = fieldsOf(makeCtx(), EEventReportEntityType.COMPANY);
        expect(DONE_DATE in out).toBe(false);
    });
});
