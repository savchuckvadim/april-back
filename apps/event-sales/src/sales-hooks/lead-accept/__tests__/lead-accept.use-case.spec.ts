import { LeadAcceptUseCase } from '../use-cases/lead-accept.use-case';
import { LeadRequestAcceptService } from '../../../lead-request/services/lead-request-accept.service';

type Row = Record<string, unknown>;

/** Портал: поля принятия, история лида и сделки, связь лид → сделка. */
const FIELDS: Record<string, string> = {
    op_lead_firstprepare_history: 'OP_LEAD_FIRSTPREPARE_HISTORY',
    op_lead_assigned_at: 'OP_LEAD_ASSIGNED_AT',
    op_lead_accepted_by: 'OP_LEAD_ACCEPTED_BY',
    to_base_sales: 'TO_BASE_SALES',
    op_mhistory: 'OP_MHISTORY',
};

const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        FIELDS[code] ? { bitrixId: FIELDS[code], items: [] } : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => 'Europe/Moscow',
    getLeadStatusIdByCode: (code: string) =>
        code === 'lead_taken_in_work' ? 'PBX_TAKEN_IN_WORK' : undefined,
    getDealCategoryByCode: () => ({
        bitrixId: '3',
        stages: [{ code: 'sales_cold', bitrixId: 'COLD' }],
    }),
};

const LEAD: Row = {
    ID: '42',
    ASSIGNED_BY_ID: '5',
    UF_CRM_TO_BASE_SALES: 'D_1024',
    UF_CRM_OP_LEAD_ASSIGNED_AT: '01.08.2026 10:00:00',
    UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: ['01.08.2026 10:00 — ХО назначен: 5'],
};
/** Сделку двинул её ответственный (7) — он и принял (робот без userId). */
const DEAL: Row = {
    ID: '1024',
    LEAD_ID: '42',
    ASSIGNED_BY_ID: '7',
    UF_CRM_OP_MHISTORY: ['01.08.2026 10:00 — старое событие'],
};

/**
 * Битрикс-заглушка с ОДНОЙ картой batch-команд, как у настоящего инстанса:
 * `callBatchWithConcurrency` отправляет и очищает её целиком. Журнал
 * событий — чтобы проверить порядок «чтения → имена → запись».
 */
function makeCtx() {
    const events: string[] = [];
    const pending: Record<string, unknown> = {};
    const writes: { cmd: string; fields: Row }[] = [];
    const write = (cmd: string, _id: number, fields: Row) =>
        writes.push({ cmd, fields });
    const bitrix = {
        batch: {
            lead: {
                get: (cmd: string) => (pending[cmd] = LEAD),
                update: write,
            },
            deal: {
                get: (cmd: string) => (pending[cmd] = DEAL),
                update: write,
            },
        },
        api: {
            // Чтение задач/дел перехвата: открытой работы нет.
            addCmdBatch: (cmd: string) => (pending[cmd] = []),
            callBatchWithConcurrency: jest.fn(() => {
                events.push(`batch:${Object.keys(pending).join(',')}`);
                const result = { ...pending };
                for (const key of Object.keys(pending)) delete pending[key];
                return Promise.resolve([{ result }]);
            }),
        },
    };
    const buffer = {
        queue: (enqueue: () => void) => {
            events.push('queue');
            enqueue();
        },
        endGroup: jest.fn(() => {
            events.push('endGroup');
            return Promise.resolve();
        }),
        flush: jest.fn(() => Promise.resolve()),
    };
    /** Сколько команд лежало в карте в момент резолва имён. */
    const pendingAtNames: number[] = [];
    const userNames = {
        resolve: jest.fn(() => {
            events.push('names');
            pendingAtNames.push(Object.keys(pending).length);
            return Promise.resolve({ 7: 'Иван Петров' });
        }),
    };
    return {
        ctx: { domain: 'd.b24.ru', portal, bitrix, buffer },
        events,
        writes,
        userNames,
        pendingAtNames,
    };
}

const makeUseCase = (userNames: object) =>
    new LeadAcceptUseCase(
        new LeadRequestAcceptService(null as never, null as never),
        userNames as never,
    );

describe('LeadAcceptUseCase — имена принявших', () => {
    /*
     * resolve сам шлёт batch (user.get + callBatchWithConcurrency): позже
     * первой записи он увёз бы закоммиченные группы буфера мимо его учёта
     * (ai/rules/bitrix-batch-grouping.md). Поэтому — строго после волн
     * чтения, при пустой карте команд, до первого queue/endGroup.
     */
    it('имена резолвятся после чтения лида и сделки и до первой записи', async () => {
        const { ctx, events, userNames, pendingAtNames } = makeCtx();

        await makeUseCase(userNames).execute(ctx as never, [{ dealId: 1024 }]);

        const names = events.indexOf('names');
        const leadRead = events.findIndex(event =>
            event.includes('la_lead_get_42'),
        );
        expect(leadRead).toBeGreaterThanOrEqual(0);
        expect(names).toBeGreaterThan(leadRead);
        expect(names).toBeLessThan(events.indexOf('queue'));
        expect(names).toBeLessThan(events.indexOf('endGroup'));
        // В момент резолва в карте команд пусто — чужого он не увезёт.
        expect(pendingAtNames).toEqual([0]);
        // Кандидаты: ответственные прочитанных лида (5) и сделки (7).
        expect(userNames.resolve).toHaveBeenCalledTimes(1);
        expect(userNames.resolve).toHaveBeenCalledWith(
            'd.b24.ru',
            ctx.bitrix,
            [5, 7],
        );
    });

    it('в историю лида и сделки уходит имя принявшего, а не id', async () => {
        const { ctx, writes, userNames } = makeCtx();

        const result = await makeUseCase(userNames).execute(ctx as never, [
            { dealId: 1024 },
        ]);

        expect(result.items[0]).toMatchObject({ success: true, leadId: 42 });
        const lead = writes.find(write => write.cmd === 'la_lead_42');
        const leadHistory = lead?.fields
            .UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(leadHistory.at(-1)).toContain(
            'Заявка принята в работу: Иван Петров',
        );
        // «Кто принял» — по-прежнему id: имя только в тексте истории.
        expect(lead?.fields.UF_CRM_OP_LEAD_ACCEPTED_BY).toBe(7);

        const deal = writes.find(write => write.cmd === 'la_deal_1024');
        const dealHistory = deal?.fields.UF_CRM_OP_MHISTORY as string[];
        expect(dealHistory[0]).toBe('01.08.2026 10:00 — старое событие');
        expect(dealHistory.at(-1)).toContain(
            'Заявка принята в работу: Иван Петров',
        );
    });

    it('явный userId попадает в список имён первым', async () => {
        const { ctx, userNames } = makeCtx();

        await makeUseCase(userNames).execute(ctx as never, [
            { leadId: 42, userId: 9 },
        ]);

        expect(userNames.resolve).toHaveBeenCalledWith(
            'd.b24.ru',
            ctx.bitrix,
            [9, 5, 7],
        );
    });
});
