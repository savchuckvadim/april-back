import { TaskFlowService } from '../services/flows/task-flow.service';

/**
 * Привязки задачи ХО из лида (garant, 14.10.2026): на воронку «ОП Холодные»
 * у менеджеров нет прав, поэтому ХО-сделку в задачу не кладём, когда есть
 * основная. ХО-сделку «Звонки» находят по её ссылке на основную.
 */
const run = (input: {
    dealRef: string;
    xoRef: string | null;
    companyRef?: string | null;
    openTasks?: unknown[];
}) => {
    const added: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const bitrix = {
        batch: {
            task: {
                add: (_cmd: string, payload: Record<string, unknown>) =>
                    added.push(payload),
                update: (
                    _cmd: string,
                    _id: number,
                    payload: Record<string, unknown>,
                ) => updated.push(payload),
                complete: () => undefined,
            },
        },
    };
    const portal = { getSalesTaskGroupId: () => 5 };
    const buffer = { queue: (fn: () => unknown) => fn() };
    const service = new TaskFlowService(bitrix as never, portal as never);
    service.queue(
        {
            leadId: 42,
            responsible: 7,
            taskMode: 'move',
            isXo: 'Y',
            createCompany: 'N',
            stageMode: 'from_lead',
        } as never,
        { openTasks: input.openTasks ?? [] } as never,
        {
            eventName: 'ООО Ромашка',
            xoTitle: 'Холодный обзвон. ООО Ромашка',
            companyRef: input.companyRef ?? null,
            dealRef: input.dealRef,
            xoRef: input.xoRef,
        },
        buffer as never,
    );
    return { added, updated };
};

describe('TaskFlowService: привязки задачи ХО', () => {
    it('есть основная — задача на лиде, основной и компании, без ХО-сделки', () => {
        const { added } = run({
            dealRef: '$result[lw_deal_42]',
            xoRef: '$result[lw_xo_42]',
            companyRef: '$result[lw_company_42]',
        });
        expect(added).toHaveLength(1);
        expect(added[0]['UF_CRM_TASK']).toEqual([
            'L_42',
            'D_$result[lw_deal_42]',
            'CO_$result[lw_company_42]',
        ]);
    });

    it('основной нет — задача на ХО-сделке, не на пустом «D_»', () => {
        const { added } = run({ dealRef: '', xoRef: '98417' });
        expect(added[0]['UF_CRM_TASK']).toEqual(['L_42', 'D_98417']);
    });

    it('ни основной, ни ХО — только лид', () => {
        const { added } = run({ dealRef: '', xoRef: null });
        expect(added[0]['UF_CRM_TASK']).toEqual(['L_42']);
    });
});
