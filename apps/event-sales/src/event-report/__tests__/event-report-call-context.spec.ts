import { TMC_DEPARTMENT_CODE } from '../dto/event-sale-flow/department.dto';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EEvFlowFrom } from '../dto/event-sale-flow/flow-context.dto';
import {
    EVENT_REPORT_OPERATION,
    eventReportCallContext,
} from '../lib/event-report-call-context';

type ContextDto = Pick<
    EventSalesFlowDto,
    'domain' | 'context' | 'plan' | 'departament'
>;

const dto = (patch: Partial<ContextDto> = {}): ContextDto =>
    ({
        domain: 'april-garant.bitrix24.ru',
        plan: { responsibility: { ID: 325 } },
        context: {
            from: EEvFlowFrom.DEAL,
            companyId: 431,
            dealId: 26735,
        },
        ...patch,
    }) as unknown as ContextDto;

describe('eventReportCallContext — подпись отчёта для тревог Битрикса', () => {
    it('отчёт из сделки: операция «Отчёт «Звонки»», сделка встройки, сотрудник отчёта', () => {
        expect(eventReportCallContext(dto())).toEqual({
            operation: EVENT_REPORT_OPERATION.calls,
            domain: 'april-garant.bitrix24.ru',
            entity: { type: 'deal', id: '26735' },
            actor: { userId: 325 },
        });
    });

    it.each([
        [EEvFlowFrom.COMPANY, { type: 'company', id: '431' }],
        [EEvFlowFrom.TASK, { type: 'task', id: '777' }],
        [EEvFlowFrom.LEAD, { type: 'lead', id: '42' }],
    ])('встройка %s — её карточка', (from, entity) => {
        const result = eventReportCallContext(
            dto({
                context: {
                    from,
                    companyId: 431,
                    dealId: 26735,
                    leadId: 42,
                    taskId: 777,
                },
            }),
        );

        expect(result.entity).toEqual(entity);
    });

    it('карточка встройки не известна — владелец по приоритету: компания → сделка → лид', () => {
        expect(
            eventReportCallContext(
                dto({
                    context: {
                        from: EEvFlowFrom.CALL_CARD,
                        dealId: 5,
                        leadId: 6,
                    },
                }),
            ).entity,
        ).toEqual({ type: 'deal', id: '5' });
    });

    it('без контекста и сотрудника — только операция и портал', () => {
        const result = eventReportCallContext(
            dto({ context: undefined, plan: undefined }),
        );

        expect(result.entity).toBeUndefined();
        expect(result.actor).toBeUndefined();
        expect(result.domain).toBe('april-garant.bitrix24.ru');
    });

    it('режим «Менеджер ТМЦ» — «Отчёт ТМЦ»; явная операция важнее', () => {
        const tmc = dto({
            departament: { mode: { code: TMC_DEPARTMENT_CODE } },
        } as unknown as Partial<ContextDto>);

        expect(eventReportCallContext(tmc).operation).toBe(
            EVENT_REPORT_OPERATION.tmc,
        );
        expect(
            eventReportCallContext(tmc, EVENT_REPORT_OPERATION.deferred)
                .operation,
        ).toBe(EVENT_REPORT_OPERATION.deferred);
    });
});
