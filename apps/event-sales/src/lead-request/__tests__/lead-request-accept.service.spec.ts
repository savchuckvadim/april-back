import { LeadRequestAcceptService } from '../services/lead-request-accept.service';

/** Портал: стадия принятия + site-поля + история + long установлены. */
const FIELDS: Record<
    string,
    {
        bitrixId: string;
        items?: { code: string; name: string; bitrixId: number }[];
    }
> = {
    op_lead_site_status: {
        bitrixId: 'OP_LEAD_SITE_STATUS',
        items: [
            {
                code: 'op_lead_site_status2',
                name: 'Взята в работу',
                bitrixId: 22,
            },
        ],
    },
    op_lead_site_stage: {
        bitrixId: 'OP_LEAD_SITE_STAGE',
        items: [
            {
                code: 'op_lead_site_stage2',
                name: 'Взята в работу',
                bitrixId: 32,
            },
        ],
    },
    op_lead_firstprepare_long: { bitrixId: 'OP_LEAD_FIRSTPREPARE_LONG' },
    op_lead_firstprepare_history: { bitrixId: 'OP_LEAD_FIRSTPREPARE_HISTORY' },
    op_lead_assigned_at: { bitrixId: 'OP_LEAD_ASSIGNED_AT' },
};

const makePortal = () => ({
    getEntityFieldByCode: (_entity: string, code: string) => {
        const def = FIELDS[code];
        return def
            ? { bitrixId: def.bitrixId, items: def.items ?? [] }
            : undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => 'Europe/Moscow',
    getLeadStatusIdByCode: (code: string) =>
        code === 'lead_taken_in_work' ? 'PBX_TAKEN_IN_WORK' : undefined,
});

type LeadUpdateMock = jest.Mock<
    Promise<unknown>,
    [number, Record<string, unknown>]
>;

const makePbx = (leadRow: Record<string, unknown>) => {
    const update: LeadUpdateMock = jest
        .fn<Promise<unknown>, [number, Record<string, unknown>]>()
        .mockResolvedValue({});
    return {
        update,
        pbx: {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    lead: {
                        get: jest.fn().mockResolvedValue({ result: leadRow }),
                        update,
                    },
                },
                PortalModel: makePortal(),
            }),
        },
    };
};

const ASSIGNED_ENTRY = '01.08.2026 10:00 — ХО назначен: 5';
const ACCEPTED_ENTRY = '01.08.2026 10:30 — Заявка принята в работу: 5';

describe('LeadRequestAcceptService', () => {
    it('принятие: стадия, site-метки, firstprepare от назначения, история', async () => {
        const { pbx, update } = makePbx({
            ID: '42',
            UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
        });
        const service = new LeadRequestAcceptService(pbx as never);

        const result = await service.accept({
            domain: 'd.b24.ru',
            leadId: 42,
            userId: 5,
        });

        expect(result.success).toBe(true);
        expect(result.already).toBe(false);
        // Назначение было 01.08.2026 — прошло сильно больше нуля секунд.
        expect(result.firstprepareSeconds).toBeGreaterThan(0);

        const fields = update.mock.calls[0][1];
        expect(fields.STATUS_ID).toBe('PBX_TAKEN_IN_WORK');
        expect(fields.UF_CRM_OP_LEAD_SITE_STATUS).toBe(22);
        expect(fields.UF_CRM_OP_LEAD_SITE_STAGE).toBe(32);
        expect(fields.UF_CRM_OP_LEAD_FIRSTPREPARE_LONG).toBe(
            result.firstprepareSeconds,
        );
        const history = fields.UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history[0]).toBe(ASSIGNED_ENTRY); // прошлое не переписано
        expect(history[1]).toContain('Заявка принята в работу: 5');
    });

    /*
     * `op_lead_assigned_at` — единственный признак «заявка ждёт
     * подтверждения»: его ставит назначение/передача, снимает принятие.
     * На него завязаны и блокирующий экран фрейма, и SLA-крон, поэтому
     * непочищенное поле = заявку заберут у менеджера, который её принял.
     */
    it('принятие снимает таймер ожидания подтверждения (op_lead_assigned_at)', async () => {
        const { pbx, update } = makePbx({
            ID: '42',
            UF_CRM_OP_LEAD_ASSIGNED_AT: '01.08.2026 10:00:00',
            UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
        });
        const service = new LeadRequestAcceptService(pbx as never);

        await service.accept({ domain: 'd.b24.ru', leadId: 42, userId: 5 });

        const fields = update.mock.calls[0][1];
        expect(fields.UF_CRM_OP_LEAD_ASSIGNED_AT).toBe('');
    });

    it('повтор после принятия — идемпотентный no-op (already=true)', async () => {
        const { pbx, update } = makePbx({
            ID: '42',
            UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [
                ASSIGNED_ENTRY,
                ACCEPTED_ENTRY,
            ],
        });
        const service = new LeadRequestAcceptService(pbx as never);

        const result = await service.accept({ domain: 'd.b24.ru', leadId: 42 });
        expect(result.already).toBe(true);
        expect(update).not.toHaveBeenCalled();
    });

    it('передали другому после принятия — принимать заново (не already)', async () => {
        const transferred = '02.08.2026 09:00 — ХО передан: 5 → 9';
        const { pbx, update } = makePbx({
            ID: '42',
            UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [
                ASSIGNED_ENTRY,
                ACCEPTED_ENTRY,
                transferred,
            ],
        });
        const service = new LeadRequestAcceptService(pbx as never);

        const result = await service.accept({
            domain: 'd.b24.ru',
            leadId: 42,
            userId: 9,
        });
        expect(result.already).toBe(false);
        expect(update).toHaveBeenCalled();
    });

    it('firstprepare уже записан — не перетирается (время ПЕРВИЧНОЙ обработки)', async () => {
        const { pbx, update } = makePbx({
            ID: '42',
            UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
            UF_CRM_OP_LEAD_FIRSTPREPARE_LONG: 100,
        });
        const service = new LeadRequestAcceptService(pbx as never);

        const result = await service.accept({ domain: 'd.b24.ru', leadId: 42 });
        expect(result.firstprepareSeconds).toBeNull();
        const fields = update.mock.calls[0][1];
        expect(fields.UF_CRM_OP_LEAD_FIRSTPREPARE_LONG).toBeUndefined();
    });
});
