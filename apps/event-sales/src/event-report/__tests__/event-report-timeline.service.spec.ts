import { EventReportContext } from '../services/context/event-report.context';
import { EventReportTimelineService } from '../services/timeline/event-report-timeline.service';

/**
 * Запись таймлайна отчёта: КУДА пишется, ЧТО в неё попадает из контекста и
 * КАК готовится к batch-проводу (экранирование — здесь, ровно один раз).
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
    ENTITY_ID: number;
    COMMENT: string;
};

const queue = (ctx: EventReportContext) => {
    const addTimelineComment = jest.fn<void, [string, TimelinePayload]>();
    new EventReportTimelineService({
        batch: { timeline: { addTimelineComment } },
    } as never).queue(ctx);
    return addTimelineComment;
};

/** Текст единственной поставленной команды. */
const commentOf = (add: ReturnType<typeof queue>, call = 0): string =>
    add.mock.calls[call][1].COMMENT;

describe('EventReportTimelineService', () => {
    it('пишет в карточку владельца события одной командой', () => {
        const add = queue(makeCtx());

        expect(add).toHaveBeenCalledTimes(1);
        const [cmd, payload] = add.mock.calls[0];
        expect(cmd).toBe('add_timeline_company_12');
        expect(payload.ENTITY_TYPE).toBe('company');
        expect(payload.ENTITY_ID).toBe(12);
    });

    it('запись пишется на ЛЮБОМ портале, а не только на gsirk', () => {
        // До 15.09 запись была под гейтом isGsirk, и на остальных порталах
        // таймлайн клиента после отчёта оставался пустым.
        expect(queue(makeCtx())).toHaveBeenCalledTimes(1);
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
                {
                    currentBaseDeal: { ID: '34', TITLE: 'СПС' },
                },
            ),
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

    it('карточка владельца себя не дублирует, остальные — ссылками', () => {
        const add = queue(
            makeCtx(
                {},
                {
                    currentBaseDeal: { ID: '34', TITLE: 'СПС' },
                    lead: { ID: '7', TITLE: 'Заявка с сайта' },
                },
            ),
        );
        const comment = commentOf(add);

        expect(comment).toContain('/crm/deal/details/34/');
        expect(comment).toContain('/crm/lead/details/7/');
        // Владелец — компания 12: ссылки на саму себя в записи нет.
        expect(comment).not.toContain('/crm/company/details/12/');
    });

    it('владелец-сделка: ссылки на саму себя тоже нет', () => {
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
        );
        const comment = commentOf(add);
        expect(comment).not.toContain('/crm/deal/details/34/');
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

    it('без сущности-владельца команда не ставится', () => {
        expect(queue(makeCtx({}, { entityId: 0 }))).not.toHaveBeenCalled();
    });
});
