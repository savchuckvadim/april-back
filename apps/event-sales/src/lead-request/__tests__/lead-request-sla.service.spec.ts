import { LeadRequestSlaService } from '../sla/lead-request-sla.service';

/**
 * SLA принятия: self-healing (менеджер двинул сделку — принятие доводится
 * задним числом) против передачи (сделка стоит в «Новая» → повторный ХО
 * с исключением прежнего + алерт руководителю).
 */
const ASSIGNED_STATUS = 'PBX_ASSIGNED';

const makePortal = () => ({
    getLeadStatusIdByCode: (code: string) =>
        code === 'lead_assigned' ? ASSIGNED_STATUS : undefined,
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_lead_firstprepare_history'
            ? { bitrixId: 'OP_LEAD_FIRSTPREPARE_HISTORY', items: [] }
            : code === 'to_base_sales'
              ? { bitrixId: 'TO_BASE_SALES', items: [] }
              : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => 'Europe/Moscow',
    getDealCategoryByCode: () => ({
        bitrixId: '3',
        stages: [{ code: 'sales_new', bitrixId: 'NEW' }],
    }),
});

const makeDeps = (input: {
    leads: Record<string, unknown>[];
    dealStage?: string;
}) => {
    const leadUpdate = jest.fn().mockResolvedValue({});
    const notify = jest.fn().mockResolvedValue(1);
    const acceptService = { accept: jest.fn().mockResolvedValue({}) };
    const dispatch = {
        accept: jest.fn().mockResolvedValue({ operationId: 'op-1' }),
    };
    const idempotency = { fingerprint: jest.fn().mockReturnValue('fp') };
    const structure = {
        getStructure: jest.fn().mockResolvedValue({
            salesDepartments: [
                {
                    department: { ID: 15, NAME: 'ОП 1', UF_HEAD: 900 },
                    groups: [],
                    allUsers: [{ ID: 5 }, { ID: 3 }],
                },
            ],
        }),
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                lead: {
                    getList: jest
                        .fn()
                        .mockResolvedValue({ result: input.leads }),
                    update: leadUpdate,
                },
                deal: {
                    get: jest.fn().mockResolvedValue({
                        result: input.dealStage
                            ? { ID: '1024', STAGE_ID: input.dealStage }
                            : undefined,
                    }),
                },
                imNotify: { systemAdd: notify },
            },
            PortalModel: makePortal(),
        }),
    };
    const service = new LeadRequestSlaService(
        pbx as never,
        acceptService as never,
        dispatch as never,
        idempotency as never,
        structure as never,
    );
    return { service, leadUpdate, notify, acceptService, dispatch };
};

const OVERDUE_LEAD = {
    ID: '42',
    TITLE: 'ООО Ромашка',
    ASSIGNED_BY_ID: '5',
    UF_CRM_TO_BASE_SALES: 'D_1024',
    UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: ['01.08.2026 10:00 — ХО назначен: 5'],
};

describe('LeadRequestSlaService', () => {
    it('просроченных нет → no-op', async () => {
        const { service, dispatch, acceptService } = makeDeps({ leads: [] });
        const run = await service.runForDomain('d.b24.ru', 60, 30);
        expect(run.candidates).toBe(0);
        expect(dispatch.accept).not.toHaveBeenCalled();
        expect(acceptService.accept).not.toHaveBeenCalled();
    });

    it('менеджер двинул сделку из «Новая» → self-healing принятие, НЕ передача', async () => {
        const { service, acceptService, dispatch } = makeDeps({
            leads: [OVERDUE_LEAD],
            dealStage: 'C3:COLD', // уже не «Новая» — работа идёт
        });
        const run = await service.runForDomain('d.b24.ru', 60, 30);
        expect(run.healed).toBe(1);
        expect(run.transferred).toBe(0);
        expect(acceptService.accept).toHaveBeenCalledWith({
            domain: 'd.b24.ru',
            leadId: 42,
        });
        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    it('сделка стоит в «Новая» → передача (без прежнего) + история + алерт руководителю', async () => {
        const { service, dispatch, leadUpdate, notify } = makeDeps({
            leads: [OVERDUE_LEAD],
            dealStage: 'C3:NEW',
        });
        const run = await service.runForDomain('d.b24.ru', 60, 30);

        expect(run.transferred).toBe(1);
        // История получила причину ДО передачи.
        const leadCalls = leadUpdate.mock.calls as unknown as [
            number,
            Record<string, unknown>,
        ][];
        const history = leadCalls[0][1]
            .UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history.join(' ')).toContain('Не принял за 60 мин: 5');

        // Передача повторным ХО: прежний исключён, отдел — его ОП.
        const dispatchCalls = dispatch.accept.mock.calls as unknown as [
            unknown,
            unknown,
            unknown,
            { data: Record<string, unknown> }[],
        ][];
        const envelope = dispatchCalls[0][3];
        expect(envelope[0].data.excludeResponsible).toBe(5);
        expect(envelope[0].data.department).toBe('15');
        expect(envelope[0].data.isXo).toBe('Y');

        // Руководитель отдела уведомлён со ссылкой на лид.
        const notifyCalls = notify.mock.calls as unknown as [
            { USER_ID: number; MESSAGE: string },
        ][];
        const message = notifyCalls[0][0];
        expect(message.USER_ID).toBe(900);
        expect(message.MESSAGE).toContain('не принята');
        expect(message.MESSAGE).toContain('/crm/lead/details/42/');
    });
});
