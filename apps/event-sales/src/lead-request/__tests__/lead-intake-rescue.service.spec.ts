import { LeadIntakeRescueService } from '../intake/lead-intake-rescue.service';

/**
 * Страховка входа: лид пришёл, а хук назначения не отработал (Битрикс
 * вебхуки не повторяет). Проверяем, что дожимаются ТОЛЬКО такие лиды —
 * ошибочный дожим увёл бы заявку у работающего менеджера.
 */
const makePortal = (withFields = true) => ({
    getEntityFieldByCode: (_entity: string, code: string) => {
        if (!withFields) return undefined;
        if (code === 'op_lead_assigned_at') {
            return { bitrixId: 'OP_LEAD_ASSIGNED_AT', items: [] };
        }
        if (code === 'to_base_sales') {
            return { bitrixId: 'TO_BASE_SALES', items: [] };
        }
        if (code === 'op_lead_site_status' || code === 'op_lead_site_stage') {
            return { bitrixId: code.toUpperCase(), items: [] };
        }
        return undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => 'Europe/Moscow',
});

const makeDeps = (input: {
    leads: Record<string, unknown>[];
    withFields?: boolean;
}) => {
    const leadGetList = jest.fn().mockResolvedValue({ result: input.leads });
    const dispatch = {
        accept: jest.fn().mockResolvedValue({ operationId: 'op-1' }),
    };
    const idempotency = { fingerprint: jest.fn().mockReturnValue('fp') };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: { lead: { getList: leadGetList } },
            PortalModel: makePortal(input.withFields ?? true),
        }),
    };
    const service = new LeadIntakeRescueService(
        pbx as never,
        dispatch as never,
        idempotency as never,
    );
    return { service, leadGetList, dispatch };
};

/** Заявка лидогена: код партнёра заполнен, назначения не было. */
const LOST_REQUEST = {
    ID: '42',
    TITLE: 'ООО Ромашка',
    UF_CRM_REG_NUMBER: '48-00691',
};

describe('LeadIntakeRescueService', () => {
    it('дожимает лид без назначения: ХО-флаги, responsible не навязан', async () => {
        const { service, dispatch } = makeDeps({ leads: [LOST_REQUEST] });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.dispatched).toBe(1);
        expect(run.skipped).toBe(0);
        const [, , , items] = dispatch.accept.mock.calls[0] as [
            string,
            string,
            string,
            { data: Record<string, unknown> }[],
        ];
        expect(items[0].data).toMatchObject({
            leadId: 42,
            isXo: 'Y',
            stageMode: 'new',
            taskMode: 'close',
        });
        // Ответственного выбирает хук (round-robin по отделу), а не крон.
        expect(items[0].data.responsible).toBeUndefined();
    });

    /*
     * Фильтр Битрикса по пустоте UF срабатывает не на всех порталах —
     * перепроверка в коде обязательна, иначе крон переназначит заявку,
     * над которой менеджер уже работает.
     */
    it('не трогает лид с заполненным op_lead_assigned_at', async () => {
        const { service, dispatch } = makeDeps({
            leads: [
                {
                    ...LOST_REQUEST,
                    UF_CRM_OP_LEAD_ASSIGNED_AT: '13.08.2026 10:00:00',
                },
            ],
        });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.dispatched).toBe(0);
        expect(run.skipped).toBe(1);
        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    it('не трогает лид, у которого уже есть наша сделка', async () => {
        const { service, dispatch } = makeDeps({
            leads: [{ ...LOST_REQUEST, UF_CRM_TO_BASE_SALES: 'D_1024' }],
        });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.dispatched).toBe(0);
        expect(run.skipped).toBe(1);
        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    it('requestsOnly=true пропускает лид без признаков заявки', async () => {
        const { service, dispatch } = makeDeps({
            leads: [{ ID: '77', TITLE: 'Лид руками' }],
        });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.dispatched).toBe(0);
        expect(run.skipped).toBe(1);
        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    it('requestsOnly=false дожимает и лид без признаков заявки', async () => {
        const { service, dispatch } = makeDeps({
            leads: [{ ID: '77', TITLE: 'Лид руками' }],
        });

        const run = await service.runForDomain('d.b24.ru', 180, 20, false);

        expect(run.dispatched).toBe(1);
        expect(dispatch.accept).toHaveBeenCalledTimes(1);
    });

    it('лимит за проход соблюдается, остаток уходит в warning', async () => {
        const { service, dispatch } = makeDeps({
            leads: [
                { ...LOST_REQUEST, ID: '1' },
                { ...LOST_REQUEST, ID: '2' },
                { ...LOST_REQUEST, ID: '3' },
            ],
        });

        const run = await service.runForDomain('d.b24.ru', 180, 2, true);

        expect(run.dispatched).toBe(2);
        expect(dispatch.accept).toHaveBeenCalledTimes(2);
        expect(run.warnings.join(' ')).toContain('Лимит 2');
    });

    /*
     * Без наших полей отличить необработанный лид от обработанного нечем:
     * дожимать вслепую нельзя — переназначили бы всех подряд.
     */
    it('поля не установлены → предупреждение и ни одного вызова', async () => {
        const { service, dispatch, leadGetList } = makeDeps({
            leads: [LOST_REQUEST],
            withFields: false,
        });

        const run = await service.runForDomain('d.b24.ru', 180, 20, true);

        expect(run.scanned).toBe(0);
        expect(leadGetList).not.toHaveBeenCalled();
        expect(dispatch.accept).not.toHaveBeenCalled();
        expect(run.warnings.join(' ')).toContain('не установлены');
    });

    it('выборка ограничена окном создания и лидами в работе', async () => {
        const { service, leadGetList } = makeDeps({ leads: [] });

        await service.runForDomain('d.b24.ru', 180, 20, true);

        const [filter] = leadGetList.mock.calls[0] as [
            Record<string, unknown>,
            string[],
        ];
        expect(filter['>DATE_CREATE']).toBeDefined();
        expect(filter.STATUS_SEMANTIC_ID).toBe('P');
        expect(filter['UF_CRM_OP_LEAD_ASSIGNED_AT']).toBe('');
    });
});
