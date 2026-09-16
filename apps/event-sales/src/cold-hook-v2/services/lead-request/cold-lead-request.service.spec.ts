import { LeadRequestAcceptService } from '../../../lead-request/services/lead-request-accept.service';
import { ColdLeadRequestV2Service } from './cold-lead-request.service';

/**
 * Адресный ХО из сделки = принятие заявки (решение владельца 16.09):
 * ждущий лид уходит новому ответственному, таймер снимается, в истории —
 * передача и принятие с пометкой «адресный ХО».
 */
type Row = Record<string, unknown>;

const FIELDS: Record<
    string,
    { bitrixId: string; items?: { code: string; bitrixId: number }[] }
> = {
    op_lead_assigned_at: { bitrixId: 'OP_LEAD_ASSIGNED_AT' },
    op_lead_accepted_by: { bitrixId: 'OP_LEAD_ACCEPTED_BY' },
    op_lead_firstprepare_history: { bitrixId: 'OP_LEAD_FIRSTPREPARE_HISTORY' },
    op_lead_firstprepare_long: { bitrixId: 'OP_LEAD_FIRSTPREPARE_LONG' },
    op_lead_site_status: {
        bitrixId: 'OP_LEAD_SITE_STATUS',
        items: [{ code: 'op_lead_site_status2', bitrixId: 22 }],
    },
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
    getDealCategoryByCode: () => undefined,
});

const makeBitrix = (rows: Row[]) => {
    const getList = jest
        .fn<Promise<{ result: Row[] }>, [Row, string[]]>()
        .mockResolvedValue({ result: rows });
    const update = jest.fn<void, [string, number, Row]>();
    return {
        getList,
        update,
        bitrix: { lead: { getList }, batch: { lead: { update } } },
    };
};

/** Буфер без батча: queue исполняет отложенную команду сразу. */
const makeBuffer = () => ({
    queue: (fn: () => void) => fn(),
});

const ASSIGNED = '16.09.2026 16:20 — ХО назначен: Вадим Савчук';

const waitingRow = (over: Row = {}): Row => ({
    ID: '225543',
    ASSIGNED_BY_ID: '447',
    STATUS_ID: 'PBX_ASSIGNED',
    STATUS_SEMANTIC_ID: 'P',
    UF_CRM_OP_LEAD_ASSIGNED_AT: '2026-09-16T16:20:47+03:00',
    UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED],
    ...over,
});

const makeService = (rows: Row[]) => {
    const portal = makePortal();
    const fake = makeBitrix(rows);
    const service = new ColdLeadRequestV2Service(
        portal as never,
        fake.bitrix as never,
        new LeadRequestAcceptService(null as never),
    );
    return { service, ...fake };
};

describe('ColdLeadRequestV2Service', () => {
    it('читает только открытые лиды с заполненным таймером', async () => {
        const { service, getList } = makeService([
            waitingRow(),
            waitingRow({ ID: '2', UF_CRM_OP_LEAD_ASSIGNED_AT: '' }),
            waitingRow({ ID: '3', STATUS_SEMANTIC_ID: 'F' }),
        ]);

        const leads = await service.loadWaiting([225543, 2, 3]);

        expect(leads.map(lead => lead.leadId)).toEqual([225543]);
        expect(leads[0].responsibleId).toBe(447);
        expect(getList.mock.calls[0][0]).toEqual({ ID: [225543, 2, 3] });
    });

    it('без лидов — ни одного запроса', async () => {
        const { service, getList } = makeService([]);
        expect(await service.loadWaiting([])).toEqual([]);
        expect(getList).not.toHaveBeenCalled();
    });

    it('переводит лид на нового ответственного и принимает заявку', async () => {
        const { service, update } = makeService([]);
        const [lead] = await makeService([waitingRow()]).service.loadWaiting([
            225543,
        ]);

        service.queue(
            'h1',
            [lead],
            325,
            { 447: 'Вадим Савчук', 325: 'Саломе Давитадзе' },
            makeBuffer() as never,
        );

        const [cmd, leadId, fields] = update.mock.calls[0];
        expect(cmd).toBe('xo2_lead_h1_225543');
        expect(leadId).toBe(225543);
        expect(fields.ASSIGNED_BY_ID).toBe('325');
        expect(fields.STATUS_ID).toBe('PBX_TAKEN_IN_WORK');
        expect(fields.UF_CRM_OP_LEAD_SITE_STATUS).toBe(22);
        expect(fields.UF_CRM_OP_LEAD_ASSIGNED_AT).toBe('');
        expect(fields.UF_CRM_OP_LEAD_ACCEPTED_BY).toBe(325);
        // Время первичной обработки — от настоящего назначения, не от ХО.
        expect(fields.UF_CRM_OP_LEAD_FIRSTPREPARE_LONG).toBeGreaterThanOrEqual(
            0,
        );

        const history = fields.UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history).toHaveLength(3);
        expect(history[0]).toBe(ASSIGNED);
        expect(history[1]).toContain(
            'ХО передан: Вадим Савчук → Саломе Давитадзе',
        );
        expect(history[2]).toContain(
            'Заявка принята в работу: Саломе Давитадзе (адресный ХО)',
        );
    });

    it('тот же ответственный — без записи о передаче', async () => {
        const { service, update } = makeService([]);
        const [lead] = await makeService([waitingRow()]).service.loadWaiting([
            225543,
        ]);

        service.queue('h1', [lead], 447, {}, makeBuffer() as never);

        const history = update.mock.calls[0][2]
            .UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history).toHaveLength(2);
        expect(history[1]).toContain(
            'Заявка принята в работу: 447 (адресный ХО)',
        );
    });
});
