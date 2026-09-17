import { LeadToWorkContextService } from '../services/lead-to-work-context.service';

type Row = Record<string, unknown>;

/**
 * Бэтч-заглушка: любая `bitrix.batch.<сущность>.<метод>(...)` пишется в
 * журнал. Нужны только вызовы поиска задач — по ним видно, по каким
 * привязкам ХО ищет открытые задачи.
 */
function makeBitrix(): { bitrix: unknown; taskFilters: Row[] } {
    const taskFilters: Row[] = [];
    const entity = (name: string) =>
        new Proxy(
            {},
            {
                get:
                    (_target, method: string) =>
                    (...args: unknown[]) => {
                        if (name === 'task' && method === 'getList') {
                            taskFilters.push(args[1] as Row);
                        }
                        return undefined;
                    },
            },
        );
    const batch = new Proxy(
        {},
        { get: (_target, name: string) => entity(name) },
    );
    return { bitrix: { batch }, taskFilters };
}

/** Портал: поле связи с основной сделкой установлено. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'to_base_sales' ? { bitrixId: 'TO_BASE_SALES' } : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getSalesTaskGroupId: () => null,
} as never;

/** Достаём приватный шаг постановки команд окружения. */
type QueueEnvironment = (
    leadId: number,
    lead: Row,
    anyTaskGroup: boolean,
) => { taskBindings: string[] };

const queueEnvironment = (
    service: LeadToWorkContextService,
): QueueEnvironment => {
    const target = service as unknown as { queueEnvironment: QueueEnvironment };
    return (leadId, lead, anyTaskGroup) =>
        target.queueEnvironment(leadId, lead, anyTaskGroup);
};

const bindingsOf = (filters: Row[]): string[] =>
    filters.flatMap(filter => (filter.UF_CRM_TASK as string[]) ?? []);

describe('LeadToWorkContextService — где ХО ищет задачи', () => {
    /*
     * 17.09.2026: задача «Звонок по переданной работе» привязана к сделке и
     * компании, а ХО искал задачи только по лиду и компании. У сделки без
     * компании такая задача для ХО не существовала: не закрывалась и
     * оставалась на прежнем ответственном.
     */
    it('ищет задачи и по основной сделке', () => {
        const { bitrix, taskFilters } = makeBitrix();
        const service = new LeadToWorkContextService(bitrix as never, portal);

        const meta = queueEnvironment(service)(
            42,
            { ID: '42', UF_CRM_TO_BASE_SALES: 'D_555' },
            false,
        );

        expect(meta.taskBindings).toContain('D_555');
        expect(bindingsOf(taskFilters)).toContain('D_555');
    });

    it('без основной сделки ищет только по лиду', () => {
        const { bitrix, taskFilters } = makeBitrix();
        const service = new LeadToWorkContextService(bitrix as never, portal);

        const meta = queueEnvironment(service)(42, { ID: '42' }, false);

        expect(meta.taskBindings).toEqual(['L_42']);
        expect(bindingsOf(taskFilters)).toEqual(['L_42']);
    });

    it('с компанией и сделкой — все три привязки', () => {
        const { bitrix } = makeBitrix();
        const service = new LeadToWorkContextService(bitrix as never, portal);

        const meta = queueEnvironment(service)(
            42,
            { ID: '42', COMPANY_ID: '7', UF_CRM_TO_BASE_SALES: 'D_555' },
            false,
        );

        expect(meta.taskBindings).toEqual(['L_42', 'CO_7', 'D_555']);
    });
});
