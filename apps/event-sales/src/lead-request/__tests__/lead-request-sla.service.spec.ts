import { LeadRequestSlaService } from '../sla/lead-request-sla.service';

/**
 * SLA принятия: self-healing (менеджер двинул сделку — принятие доводится
 * задним числом) против передачи (сделка стоит в «Новая» → повторный ХО
 * с исключением прежнего + алерт руководителю).
 */
const ASSIGNED_STATUS = 'PBX_ASSIGNED';

/**
 * Портал: `withAssignedAt` включает поля НОВОГО механизма отбора —
 * `op_lead_assigned_at` (таймер) и `op_lead_site_stage` (метка заявки).
 * Без них сервис откатывается на прежний путь (стадия + DATE_MODIFY).
 */
const makePortal = (withAssignedAt = false) => ({
    getLeadStatusIdByCode: (code: string) =>
        code === 'lead_assigned' ? ASSIGNED_STATUS : undefined,
    getEntityFieldByCode: (_entity: string, code: string) => {
        if (code === 'op_lead_firstprepare_history') {
            return { bitrixId: 'OP_LEAD_FIRSTPREPARE_HISTORY', items: [] };
        }
        if (code === 'to_base_sales') {
            return { bitrixId: 'TO_BASE_SALES', items: [] };
        }
        if (withAssignedAt && code === 'op_lead_assigned_at') {
            return { bitrixId: 'OP_LEAD_ASSIGNED_AT', items: [] };
        }
        if (withAssignedAt && code === 'op_lead_site_status') {
            return {
                bitrixId: 'OP_LEAD_SITE_STATUS',
                items: [{ code: 'op_lead_site_status1', bitrixId: 71 }],
            };
        }
        return undefined;
    },
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
    /** Кандидаты ВТОРОГО прохода — сделки со своим таймером. */
    deals?: Record<string, unknown>[];
    /** Лиды этих сделок, у которых таймер ещё не снят (busy). */
    busyLeads?: Record<string, unknown>[];
    dealStage?: string;
    withAssignedAt?: boolean;
}) => {
    const leadUpdate = jest.fn().mockResolvedValue({});
    const notify = jest.fn().mockResolvedValue(1);
    const acceptService = {
        accept: jest.fn().mockResolvedValue({}),
        // Реальная реализация — чистый разбор строки сделки; в моке хватает
        // штатного LEAD_ID (наши поля связей в тестах не заполнены).
        leadIdFromDealRow: (
            _portal: unknown,
            deal?: Record<string, unknown>,
        ) => (deal?.LEAD_ID ? Number(deal.LEAD_ID) : null),
    };
    const dispatch = {
        accept: jest.fn().mockResolvedValue({ operationId: 'op-1' }),
    };
    const idempotency = { fingerprint: jest.fn().mockReturnValue('fp') };
    const structure = {
        getStructure: jest.fn().mockResolvedValue({
            salesDepartments: [
                {
                    // HEADS: руководитель + заместитель — уведомляются оба
                    department: {
                        ID: 15,
                        NAME: 'ОП 1',
                        UF_HEAD: 900,
                        HEADS: [900, 901],
                    },
                    groups: [],
                    allUsers: [{ ID: 5 }, { ID: 3 }],
                },
            ],
        }),
    };
    /*
     * lead.getList вызывается дважды: первый раз — кандидаты ПЕРВОГО
     * прохода, второй — лиды сделок второго прохода («кто ещё ждёт»).
     */
    const leadGetList = jest
        .fn()
        .mockResolvedValueOnce({ result: input.leads })
        .mockResolvedValue({ result: input.busyLeads ?? [] });
    const dealGetList = jest
        .fn()
        .mockResolvedValue({ result: input.deals ?? [] });
    const assignee = {
        resolve: jest.fn().mockResolvedValue({
            responsible: 3,
            source: 'round-robin',
            departmentKey: 'op_15',
            warnings: [],
        }),
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: {
                lead: {
                    getList: leadGetList,
                    update: leadUpdate,
                },
                deal: {
                    getList: dealGetList,
                    get: jest.fn().mockResolvedValue({
                        result: input.dealStage
                            ? { ID: '1024', STAGE_ID: input.dealStage }
                            : undefined,
                    }),
                },
                imNotify: { systemAdd: notify },
            },
            PortalModel: makePortal(input.withAssignedAt),
        }),
    };
    const service = new LeadRequestSlaService(
        pbx as never,
        acceptService as never,
        dispatch as never,
        idempotency as never,
        structure as never,
        assignee as never,
    );
    return {
        service,
        leadUpdate,
        notify,
        acceptService,
        dispatch,
        leadGetList,
        dealGetList,
        assignee,
    };
};

const OVERDUE_LEAD = {
    ID: '42',
    TITLE: 'ООО Ромашка',
    ASSIGNED_BY_ID: '5',
    UF_CRM_TO_BASE_SALES: 'D_1024',
    UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: ['01.08.2026 10:00 — ХО назначен: 5'],
};

describe('LeadRequestSlaService', () => {
    /*
     * Отбор идёт по НАШИМ полям, а не по стадии лида: стадию двигают
     * конструктор, роботы и менеджеры руками, а op_lead_assigned_at пишет
     * только хук назначения и очищает только принятие.
     */
    it('фильтр: заполненный op_lead_assigned_at старше порога + метка заявки, без стадии лида', async () => {
        const { service, leadGetList } = makeDeps({
            leads: [],
            withAssignedAt: true,
        });
        await service.runForDomain('d.b24.ru', 60, 30);

        const filter = (
            leadGetList.mock.calls as unknown as [Record<string, unknown>][]
        )[0][0];
        // Таймер: поле заполнено И старше порога.
        expect(filter['!UF_CRM_OP_LEAD_ASSIGNED_AT']).toBe('');
        expect(filter['<UF_CRM_OP_LEAD_ASSIGNED_AT']).toMatch(
            /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/,
        );
        // Только заявки: метку статуса ставит хук распознанной заявке
        // (ось слита — признаком служит site_status, не site_stage).
        // Именно «заполнен», а не «= Появилась»: у принятой и затем
        // переданной заявки статус остаётся «Взята в работу», и по
        // равенству крон её бы не увидел, хотя фрейм требует подтверждения.
        expect(filter['!UF_CRM_OP_LEAD_SITE_STATUS']).toBe('');
        expect(filter.UF_CRM_OP_LEAD_SITE_STATUS).toBeUndefined();
        expect(filter['!UF_CRM_OP_LEAD_SITE_STAGE']).toBeUndefined();
        // Стадия лида в отборе не участвует.
        expect(filter.STATUS_ID).toBeUndefined();
    });

    it('поля нет на портале → fallback на стадию + DATE_MODIFY с предупреждением', async () => {
        const { service, leadGetList } = makeDeps({ leads: [] });
        const run = await service.runForDomain('d.b24.ru', 60, 30);

        const filter = (
            leadGetList.mock.calls as unknown as [Record<string, unknown>][]
        )[0][0];
        expect(filter.STATUS_ID).toBe(ASSIGNED_STATUS);
        expect(filter['<DATE_MODIFY']).toBeDefined();
        expect(run.warnings.join(' ')).toContain('Заявка назначена (дата)');
    });

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
        // Заместитель из HEADS получает то же уведомление.
        expect(notifyCalls.map(call => call[0].USER_ID)).toEqual([900, 901]);
    });

    /* ------------------------------------------------------------------ *
     * ВТОРОЙ ПРОХОД — сделки со своим таймером подтверждения.
     * ------------------------------------------------------------------ */

    const OVERDUE_DEAL = {
        ID: '1024',
        TITLE: 'ООО Ромашка',
        ASSIGNED_BY_ID: '5',
    };

    it('сделки: отбор по НЕПУСТОМУ op_lead_assigned_at старше порога', async () => {
        const { service, dealGetList } = makeDeps({
            leads: [],
            deals: [],
            withAssignedAt: true,
        });
        await service.runForDomain('d.b24.ru', 60, 30);

        const filter = (
            dealGetList.mock.calls as unknown as [Record<string, unknown>][]
        )[0][0];
        expect(filter['!UF_CRM_OP_LEAD_ASSIGNED_AT']).toBe('');
        expect(filter['<UF_CRM_OP_LEAD_ASSIGNED_AT']).toMatch(
            /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/,
        );
        expect(filter.CLOSED).toBe('N');
    });

    it('сделка не подтверждена → передача хуком transfer-work', async () => {
        const { service, dispatch, assignee } = makeDeps({
            leads: [],
            deals: [OVERDUE_DEAL],
            withAssignedAt: true,
        });
        const run = await service.runForDomain('d.b24.ru', 60, 30);

        expect(run.dealCandidates).toBe(1);
        expect(run.dealsTransferred).toBe(1);
        // Прежний ответственный исключён из круга.
        const assigneeCalls = assignee.resolve.mock.calls as unknown as [
            string,
            Record<string, unknown>,
        ][];
        expect(assigneeCalls[0][1]).toMatchObject({ excludeResponsible: 5 });
        const dispatchCalls = dispatch.accept.mock.calls as unknown as [
            unknown,
            unknown,
            unknown,
            { data: Record<string, unknown> }[],
        ][];
        const envelope = dispatchCalls[0][3];
        expect(envelope[0].data.dealIds).toEqual([1024]);
        expect(envelope[0].data.newResponsibleId).toBe(3);
    });

    /*
     * Ключевая защита: подтверждённая работа не должна забираться. Пустой
     * таймер вообще не попадает в выборку — проверяем, что при отсутствии
     * кандидатов ни одна передача не уходит.
     */
    it('подтверждённая сделка (таймер снят) не попадает в выборку и не передаётся', async () => {
        const { service, dispatch } = makeDeps({
            leads: [],
            deals: [],
            withAssignedAt: true,
        });
        const run = await service.runForDomain('d.b24.ru', 60, 30);
        expect(run.dealCandidates).toBe(0);
        expect(run.dealsTransferred).toBe(0);
        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    /*
     * Двойная обработка одного клиента: у лида свой таймер ещё висит —
     * значит им занимается лидовый контур, и сделку второй проход не трогает.
     */
    it('сделка пропускается, если её лид ещё ждёт подтверждения', async () => {
        const { service, dispatch } = makeDeps({
            leads: [],
            deals: [{ ...OVERDUE_DEAL, LEAD_ID: '42' }],
            busyLeads: [{ ID: '42' }],
            withAssignedAt: true,
        });
        const run = await service.runForDomain('d.b24.ru', 60, 30);
        expect(run.dealCandidates).toBe(1);
        expect(run.dealsTransferred).toBe(0);
        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    /*
     * Сделка, которую уже переназначил ПЕРВЫЙ проход (она базовая для
     * просроченного лида), во втором проходе не участвует — иначе работа
     * уехала бы к двум разным людям.
     */
    it('базовая сделка просроченного лида не передаётся вторым проходом', async () => {
        const { service, dispatch } = makeDeps({
            leads: [OVERDUE_LEAD], // UF_CRM_TO_BASE_SALES = 'D_1024'
            deals: [OVERDUE_DEAL], // тот же 1024
            dealStage: 'C3:NEW',
            withAssignedAt: true,
        });
        const run = await service.runForDomain('d.b24.ru', 60, 30);

        expect(run.transferred).toBe(1); // передал первый проход
        expect(run.dealCandidates).toBe(0); // второй её отфильтровал
        expect(run.dealsTransferred).toBe(0);
        // Единственная передача — лидовая.
        expect(dispatch.accept).toHaveBeenCalledTimes(1);
    });

    it('поле на сделке не установлено → предупреждение, второй проход пропущен', async () => {
        const { service, dealGetList } = makeDeps({ leads: [] });
        const run = await service.runForDomain('d.b24.ru', 60, 30);
        expect(dealGetList).not.toHaveBeenCalled();
        expect(run.warnings.join(' ')).toContain('на СДЕЛКЕ');
    });
});
