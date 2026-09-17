import { LeadRequestAcceptService } from '../../../lead-request/services/lead-request-accept.service';
import { ColdLeadRequestV2Service } from './cold-lead-request.service';

/**
 * Адресный ХО = принятие заявки (решение владельца 16.09) и новый
 * ответственный на всех открытых лидах клиента (17.09): таймер снимается,
 * в истории — передача и принятие с пометкой «адресный ХО», статус лида
 * назад не откатывается.
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
    manager_op: { bitrixId: 'MANAGER_OP' },
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
    getLeadStageCodeByStatusId: (statusId: string) =>
        ({ UC_PRES: 'lead_pres' })[statusId],
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
    it('читает все открытые лиды, признак ожидания — по таймеру', async () => {
        const { service, getList } = makeService([
            waitingRow(),
            waitingRow({ ID: '2', UF_CRM_OP_LEAD_ASSIGNED_AT: '' }),
            waitingRow({ ID: '3', STATUS_SEMANTIC_ID: 'F' }),
            waitingRow({ ID: '4', STATUS_SEMANTIC_ID: 'S' }),
        ]);

        const leads = await service.loadOpen([225543, 2, 3, 4]);

        expect(leads.map(lead => [lead.leadId, lead.waiting])).toEqual([
            [225543, true],
            [2, false],
        ]);
        expect(leads[0].responsibleId).toBe(447);
        expect(getList.mock.calls[0][0]).toEqual({ ID: [225543, 2, 3, 4] });
        expect(getList.mock.calls[0][1]).toEqual(
            expect.arrayContaining(['STATUS_ID', 'UF_CRM_OP_LEAD_ASSIGNED_AT']),
        );
    });

    it('без лидов — ни одного запроса', async () => {
        const { service, getList } = makeService([]);
        expect(await service.loadOpen([])).toEqual([]);
        expect(getList).not.toHaveBeenCalled();
    });

    it('переводит лид на нового ответственного и принимает заявку', async () => {
        const { service, update } = makeService([]);
        const [lead] = await makeService([waitingRow()]).service.loadOpen([
            225543,
        ]);

        service.queue(
            'h1',
            [lead],
            325,
            { 447: 'Вадим Савчук', 325: 'Саломе Давитадзе' },
            makeBuffer(),
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
        const [lead] = await makeService([waitingRow()]).service.loadOpen([
            225543,
        ]);

        service.queue('h1', [lead], 447, {}, makeBuffer());

        const history = update.mock.calls[0][2]
            .UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history).toHaveLength(2);
        expect(history[1]).toContain(
            'Заявка принята в работу: 447 (адресный ХО)',
        );
    });

    it('уже принятая заявка у другого сотрудника — только ответственный и передача', async () => {
        const { service, update } = makeService([]);
        const [lead] = await makeService([
            waitingRow({
                STATUS_ID: 'PBX_TAKEN_IN_WORK',
                UF_CRM_OP_LEAD_ASSIGNED_AT: '',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [
                    ASSIGNED,
                    '16.09.2026 16:30 — Заявка принята в работу: Вадим Савчук',
                ],
            }),
        ]).service.loadOpen([225543]);

        service.queue(
            'h1',
            [lead],
            325,
            { 447: 'Вадим Савчук', 325: 'Саломе Давитадзе' },
            makeBuffer(),
        );

        const [, , fields] = update.mock.calls[0];
        expect(Object.keys(fields).sort()).toEqual([
            'ASSIGNED_BY_ID',
            'UF_CRM_MANAGER_OP',
            'UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY',
        ]);
        expect(fields.ASSIGNED_BY_ID).toBe('325');
        expect(fields.UF_CRM_MANAGER_OP).toBe(325);
        const history = fields.UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history).toHaveLength(3);
        expect(history[2]).toContain(
            'ХО передан: Вадим Савчук → Саломе Давитадзе',
        );
    });

    it('уже принятая заявка у того же сотрудника — ни одной команды', async () => {
        const { service, update } = makeService([]);
        const [lead] = await makeService([
            waitingRow({
                UF_CRM_MANAGER_OP: '447',
                UF_CRM_OP_LEAD_ASSIGNED_AT: '',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [
                    ASSIGNED,
                    '16.09.2026 16:30 — Заявка принята в работу: Вадим Савчук',
                ],
            }),
        ]).service.loadOpen([225543]);

        service.queue('h1', [lead], 447, {}, makeBuffer());

        expect(update).not.toHaveBeenCalled();
    });

    it('лид дальше «Взята в работу» — статус не откатывается, остальное принятие пишется', async () => {
        const { service, update } = makeService([]);
        const [lead] = await makeService([
            waitingRow({ STATUS_ID: 'UC_PRES' }),
        ]).service.loadOpen([225543]);

        service.queue('h1', [lead], 325, {}, makeBuffer());

        const [, , fields] = update.mock.calls[0];
        expect(fields).not.toHaveProperty('STATUS_ID');
        expect(fields).toMatchObject({
            ASSIGNED_BY_ID: '325',
            UF_CRM_OP_LEAD_ASSIGNED_AT: '',
            UF_CRM_OP_LEAD_ACCEPTED_BY: 325,
        });
    });

    it('лид без ответственного — ответственный ставится, записи о передаче нет', async () => {
        const { service, update } = makeService([]);
        const [lead] = await makeService([
            waitingRow({ ASSIGNED_BY_ID: '', STATUS_ID: 'NEW' }),
        ]).service.loadOpen([225543]);

        service.queue('h1', [lead], 325, {}, makeBuffer());

        const [, , fields] = update.mock.calls[0];
        expect(fields.ASSIGNED_BY_ID).toBe('325');
        expect(fields.STATUS_ID).toBe('PBX_TAKEN_IN_WORK');
        const history = fields.UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history.some(entry => entry.includes('ХО передан'))).toBe(false);
    });

    it('принятый лид у того же сотрудника, но менеджер другой — только менеджер', async () => {
        const { service, update } = makeService([]);
        const [lead] = await makeService([
            waitingRow({
                UF_CRM_MANAGER_OP: '448',
                UF_CRM_OP_LEAD_ASSIGNED_AT: '',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [
                    ASSIGNED,
                    '16.09.2026 16:30 — Заявка принята в работу: Вадим Савчук',
                ],
            }),
        ]).service.loadOpen([225543]);

        service.queue('h1', [lead], 447, {}, makeBuffer());

        const [, , fields] = update.mock.calls[0];
        expect(fields).toEqual({
            ASSIGNED_BY_ID: '447',
            UF_CRM_MANAGER_OP: 447,
        });
    });

    it('менеджер по продажам читается и пишется на лид вместе с принятием', async () => {
        const { service: reader, getList } = makeService([waitingRow()]);
        const [lead] = await reader.loadOpen([225543]);
        expect(getList.mock.calls[0][1]).toContain('UF_CRM_MANAGER_OP');

        const { service, update } = makeService([]);
        service.queue('h1', [lead], 325, {}, makeBuffer());

        expect(update.mock.calls[0][2].UF_CRM_MANAGER_OP).toBe(325);
    });
});
