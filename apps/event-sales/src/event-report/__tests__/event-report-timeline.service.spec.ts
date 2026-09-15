import { EventReportContext } from '../services/context/event-report.context';
import { DealFlowResult } from '../services/deal/event-report-deal-flow.service';
import { EventReportTimelineService } from '../services/timeline/event-report-timeline.service';

/**
 * Запись таймлайна отчёта: В КАКИЕ КАРТОЧКИ пишется, что в неё попадает из
 * контекста и как готовится к batch-проводу (экранирование — здесь, ровно
 * один раз).
 */
const NOW = new Date('2026-09-15T09:00:00.000Z');

const makePortal = (domain = 'd.b24.ru') => ({
    getTimezone: () => 'Europe/Moscow',
    getPortal: () => ({ domain }),
});

const makeCtx = (
    dto: Record<string, unknown> = {},
    init: Record<string, unknown> = {},
): EventReportContext =>
    new EventReportContext(
        {
            currentTask: { eventType: 'warm', name: 'Первый контакт' },
            report: { resultStatus: 'result', description: '' },
            plan: { isActive: false },
            ...dto,
        } as never,
        makePortal() as never,
        {
            entityType: 'company',
            entityId: 12,
            company: { ID: '12', TITLE: 'ООО «Ромашка»' },
            lead: null,
            currentBaseDeal: null,
            reportContact: null,
            planContact: null,
            currentPresDeal: null,
            ...init,
        } as never,
        NOW,
    );

type TimelinePayload = {
    ENTITY_TYPE: string;
    ENTITY_ID: number | string;
    COMMENT: string;
};

/** Итог deal-flow; `baseDealId` — реальный id либо подстановка батча. */
const deals = (baseDealId: string | null = null): DealFlowResult => ({
    baseDealId,
    newPlanPresDealId: null,
    newUnplannedPresDealId: null,
});

const queue = (ctx: EventReportContext, dealFlow: DealFlowResult = deals()) => {
    const addTimelineComment = jest.fn<void, [string, TimelinePayload]>();
    new EventReportTimelineService({
        batch: { timeline: { addTimelineComment } },
    } as never).queue(ctx, dealFlow);
    return addTimelineComment;
};

type Add = ReturnType<typeof queue>;

/** Куда уехали записи: пары `тип:id` в порядке постановки команд. */
const targetsOf = (add: Add): string[] =>
    add.mock.calls.map(
        ([, payload]) => `${payload.ENTITY_TYPE}:${String(payload.ENTITY_ID)}`,
    );

const commentOf = (add: Add, call = 0): string =>
    add.mock.calls[call][1].COMMENT;

describe('EventReportTimelineService — куда пишем', () => {
    it('владелец-компания + основная сделка: две записи', () => {
        const add = queue(
            makeCtx({}, { currentBaseDeal: { ID: '34', TITLE: 'СПС' } }),
            deals('34'),
        );

        expect(targetsOf(add)).toEqual(['company:12', 'deal:34']);
    });

    it('основная сделка получает запись и когда создаётся этим же батчем', () => {
        // Реального id ещё нет — ENTITY_ID уезжает подстановкой батча.
        const add = queue(makeCtx(), deals('$result[set_base_deal]'));

        expect(targetsOf(add)).toEqual([
            'company:12',
            'deal:$result[set_base_deal]',
        ]);
    });

    it('владелец-лид: запись в лид, компанию и основную сделку', () => {
        const add = queue(
            makeCtx(
                {},
                {
                    entityType: 'lead',
                    entityId: 7,
                    company: { ID: '12', TITLE: 'ООО «Ромашка»' },
                    lead: { ID: '7', TITLE: 'Заявка с сайта' },
                    currentBaseDeal: { ID: '34', TITLE: 'СПС' },
                },
            ),
            deals('34'),
        );

        expect(targetsOf(add)).toEqual(['lead:7', 'company:12', 'deal:34']);
    });

    it('владелец — та же основная сделка: запись одна, без дубля', () => {
        const add = queue(
            makeCtx(
                {},
                {
                    entityType: 'deal',
                    entityId: 34,
                    company: null,
                    currentBaseDeal: { ID: '34', TITLE: 'СПС' },
                },
            ),
            deals('34'),
        );

        expect(targetsOf(add)).toEqual(['deal:34']);
    });

    it('сделки нет вовсе (lead-only) — только карточка владельца', () => {
        const add = queue(
            makeCtx(
                {},
                {
                    entityType: 'lead',
                    entityId: 7,
                    company: null,
                    lead: { ID: '7', TITLE: 'Заявка' },
                },
            ),
            deals(null),
        );

        expect(targetsOf(add)).toEqual(['lead:7']);
    });

    it('без сущности-владельца и без сделки команд нет', () => {
        expect(
            queue(makeCtx({}, { entityId: 0, company: null }), deals(null)),
        ).not.toHaveBeenCalled();
    });
});

describe('EventReportTimelineService — что в записи', () => {
    it('запись пишется на ЛЮБОМ портале, а не только на gsirk', () => {
        // До 15.09 запись была под гейтом isGsirk, и на остальных порталах
        // таймлайн клиента после отчёта оставался пустым.
        expect(queue(makeCtx())).toHaveBeenCalled();
    });

    it('в своей карточке нет ссылки на саму себя, в чужой — есть', () => {
        const add = queue(
            makeCtx(
                {},
                {
                    currentBaseDeal: { ID: '34', TITLE: 'СПС' },
                    lead: { ID: '7', TITLE: 'Заявка с сайта' },
                },
            ),
            deals('34'),
        );

        const companyRecord = commentOf(add, 0);
        expect(companyRecord).not.toContain('/crm/company/details/12/');
        expect(companyRecord).toContain('/crm/deal/details/34/');
        expect(companyRecord).toContain('/crm/lead/details/7/');

        const dealRecord = commentOf(add, 1);
        expect(dealRecord).not.toContain('/crm/deal/details/34/');
        expect(dealRecord).toContain('/crm/company/details/12/');
    });

    it('комментарий экранирован под batch: переносы — %0A, «#» — %23', () => {
        const add = queue(
            makeCtx(
                {
                    report: {
                        resultStatus: 'result',
                        description: 'счёт #1 на 50% + НДС',
                    },
                },
                { currentBaseDeal: { ID: '34', TITLE: 'СПС' } },
            ),
            deals('34'),
        );
        const comment = commentOf(add);

        expect(comment).toContain('%0A');
        expect(comment).not.toContain('\n');
        expect(comment).toContain('%231');
        expect(comment).toContain('50%25');
        expect(comment).toContain('%2B');
        // Ссылка кликабельная и целая — ради этого экранирование и нужно.
        expect(comment).toContain(
            '<a href="https://d.b24.ru/crm/deal/details/34/" target="_blank">СПС</a>',
        );
    });

    it('контакты отчёта и плана уезжают ссылками на свои карточки', () => {
        const add = queue(
            makeCtx(
                {
                    plan: {
                        isActive: true,
                        isPlanned: true,
                        type: { current: { code: 'hot' } },
                        deadline: '23.09.2026 16:20:00',
                    },
                },
                {
                    reportContact: {
                        ID: '56',
                        NAME: 'Иван',
                        LAST_NAME: 'Иванов',
                    },
                    planContact: {
                        ID: '57',
                        NAME: 'Пётр',
                        LAST_NAME: 'Петров',
                    },
                },
            ),
        );
        const comment = commentOf(add);

        expect(comment).toContain('/crm/contact/details/56/');
        expect(comment).toContain('Иванов Иван');
        expect(comment).toContain('/crm/contact/details/57/');
        expect(comment).toContain('Петров Пётр');
    });
});
