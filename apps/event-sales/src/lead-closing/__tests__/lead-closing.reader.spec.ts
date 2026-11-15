import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { LeadClosingLead, LeadClosingReader } from '../lead-closing.reader';

/**
 * Портал: «ОП Основная» = 31 (garant-подобные стадии, свой «Дубль» не
 * сопоставлен), «ОП Холодные» = 33, «ОП Презентации» = 35; прочие — чужие.
 */
const BASE = {
    bitrixId: 31,
    code: 'sales_base',
    stages: [
        { code: 'sales_warm', bitrixId: 'WARM' },
        { code: 'sales_success', bitrixId: 'WON' },
        { code: 'sales_fail', bitrixId: 'LOSE' },
        { code: 'sales_double', bitrixId: 'APOLOGY' },
        { code: 'sales_not_ca', bitrixId: 'NOT_CA' },
        { code: 'sales_duplicate', bitrixId: 'DUPLICATE' },
    ],
};
const portal = {
    getDealCategoryByCode: (code: string) =>
        ({
            sales_base: BASE,
            sales_xo: { bitrixId: 33, code, stages: [] },
            sales_presentation: { bitrixId: 35, code, stages: [] },
        })[code],
    /** Установлено только поле «присоединённые лиды» сделки. */
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'deal_joined_leads'
            ? { bitrixId: 'DEAL_JOINED_LEADS' }
            : undefined,
} as unknown as PortalModel;

const deal = (over: Partial<IBXDeal>): IBXDeal => ({
    ID: 0,
    TITLE: '',
    STAGE_ID: '',
    COMMENTS: '',
    ASSIGNED_BY_ID: '1',
    CREATED_BY_ID: '1',
    OPENED: 'Y',
    MOVED_TIME: '',
    LAST_ACTIVITY_TIME: '',
    STAGE_SEMANTIC_ID: 'P',
    CATEGORY_ID: '31',
    CLOSED: 'N',
    COMPANY_ID: '0',
    CONTACT_ID: 0,
    LEAD_ID: undefined,
    DATE_MODIFY: '2026-11-01T10:00:00+03:00',
    ...over,
});

/**
 * Битрикс: deal.all отдаёт сделки по фильтру `@ID` / `@COMPANY_ID` / `@CONTACT_ID`,
 * batch-поиск — по значению в «присоединённых лидах».
 */
const bitrixWith = (deals: IBXDeal[], dealsWithOpenTasks: number[] = []) => {
    const taskAll = jest.fn((filter: Record<string, string[]>) =>
        Promise.resolve({
            tasks: (filter.UF_CRM_TASK ?? [])
                .filter(b => dealsWithOpenTasks.includes(Number(b.slice(2))))
                .map((b, i) => ({ id: String(i + 1), ufCrmTask: [b] })),
        }),
    );
    const queued: Array<[string, Record<string, string>]> = [];
    const getList = jest.fn((cmd: string, filter: Record<string, string>) => {
        queued.push([cmd, filter]);
    });
    const callBatchWithConcurrency = jest.fn(() => {
        const result: Record<string, IBXDeal[]> = {};
        for (const [cmd, filter] of queued.splice(0)) {
            const [key, value] = Object.entries(filter)[0];
            result[cmd] = deals.filter(d =>
                String(d[key] ?? '')
                    .split(',')
                    .includes(value),
            );
        }
        return Promise.resolve([{ result, result_error: [] }]);
    });
    const all = jest.fn((filter: Record<string, number[]>) => {
        const [key, ids] = Object.entries(filter)[0];
        const field = key.slice(1);
        return Promise.resolve(
            deals.filter(d => ids.includes(Number(d[field]))),
        );
    });
    return {
        bitrix: {
            deal: { all },
            task: { getAll: taskAll },
            company: {
                all: jest.fn((filter: Record<string, number[]>) =>
                    Promise.resolve(
                        (filter['@ID'] ?? []).map(id => ({
                            ID: id,
                            LEAD_ID: id === 5 ? '42' : null,
                        })),
                    ),
                ),
            },
            batch: { deal: { getList } },
            api: { callBatchWithConcurrency },
        } as unknown as BitrixService,
        all,
    };
};

const lead = (over: Partial<LeadClosingLead>): LeadClosingLead => ({
    id: 1,
    statusId: 'PBX_TAKEN_IN_WORK',
    companyId: 0,
    contactId: 0,
    dealId: 10,
    ...over,
});

describe('LeadClosingReader', () => {
    it('сделка в работе — решение без поиска других сделок клиента', async () => {
        const { bitrix, all } = bitrixWith([
            deal({ ID: 10, STAGE_ID: 'C31:WARM', LEAD_ID: 1 }),
        ]);
        const [result] = await new LeadClosingReader(bitrix, portal).read([
            lead({}),
        ]);

        expect(result.decision).toEqual({
            target: 'lead_converted',
            linkDealId: 10,
            reason: 'deal_open',
        });
        expect(result.linkDealLeadId).toBe(1);
        expect(all).toHaveBeenCalledTimes(1);
    });

    it('«Не состоялась»: живая сделка клиента находится по контакту, берётся самая свежая', async () => {
        const { bitrix } = bitrixWith([
            deal({ ID: 10, STAGE_ID: 'C31:APOLOGY', CONTACT_ID: 7 }),
            deal({
                ID: 20,
                STAGE_ID: 'C31:WARM',
                CONTACT_ID: 7,
                DATE_MODIFY: '2026-10-01T10:00:00+03:00',
            }),
            deal({
                ID: 30,
                STAGE_ID: 'C31:WARM',
                CONTACT_ID: 7,
                DATE_MODIFY: '2026-11-10T10:00:00+03:00',
                LEAD_ID: 99,
            }),
            deal({
                ID: 40,
                STAGE_ID: 'C31:LOSE',
                CONTACT_ID: 7,
                DATE_MODIFY: '2026-11-12T10:00:00+03:00',
            }),
        ]);
        const [result] = await new LeadClosingReader(bitrix, portal).read([
            lead({}),
        ]);

        expect(result.decision).toEqual({
            target: 'lead_converted',
            linkDealId: 30,
            reason: 'apology_live_deal',
        });
        expect(result.linkDealLeadId).toBe(99);
    });

    describe('«Не состоялась» и открытые сделки в других воронках (правило 15.11)', () => {
        const apology = deal({
            ID: 10,
            STAGE_ID: 'C31:APOLOGY',
            COMPANY_ID: '5',
        });
        const foreign = deal({
            ID: 50,
            CATEGORY_ID: '3',
            STAGE_ID: 'C3:NEW',
            COMPANY_ID: '5',
        });
        const xo = deal({
            ID: 60,
            CATEGORY_ID: '33',
            STAGE_ID: 'C33:PLAN',
            COMPANY_ID: '5',
        });

        it('чужая воронка с открытой задачей — работа идёт, лид не трогаем', async () => {
            const { bitrix } = bitrixWith([apology, foreign], [50]);
            const [result] = await new LeadClosingReader(bitrix, portal).read([
                lead({ companyId: 5 }),
            ]);

            expect(result.decision.reason).toBe('apology_work_elsewhere');
            expect(result.decision.target).toBeNull();
        });

        it('чужая воронка без открытых задач — висяк, лид закрывается', async () => {
            const { bitrix } = bitrixWith([apology, foreign]);
            const [result] = await new LeadClosingReader(bitrix, portal).read([
                lead({ companyId: 5 }),
            ]);

            expect(result.decision).toMatchObject({
                target: 'lead_apology',
                reason: 'apology_no_work',
            });
        });

        it('открытая ХО без живой «ОП Основная» — не работа, а подозрительный висяк', async () => {
            const { bitrix } = bitrixWith([apology, xo], [60]);
            const [result] = await new LeadClosingReader(bitrix, portal).read([
                lead({ companyId: 5 }),
            ]);

            expect(result.decision.reason).toBe('apology_no_work');
            expect(result.suspiciousDealIds).toEqual([60]);
        });
    });

    it('сделка удалена — клиент ищется по компании лида', async () => {
        const { bitrix } = bitrixWith([
            deal({ ID: 20, STAGE_ID: 'C31:WON', COMPANY_ID: '5' }),
        ]);
        const [result] = await new LeadClosingReader(bitrix, portal).read([
            lead({ companyId: 5 }),
        ]);

        expect(result.decision).toEqual({
            target: 'lead_converted',
            linkDealId: 20,
            reason: 'deleted_live_deal',
        });
    });

    it('стадия, которой нет в модели портала (ручной «Дубль»), — не трогаем', async () => {
        const { bitrix } = bitrixWith([
            deal({ ID: 10, STAGE_ID: 'C31:UC_X52JYI' }),
        ]);
        const [result] = await new LeadClosingReader(bitrix, portal).read([
            lead({}),
        ]);

        expect(result.decision.reason).toBe('unknown_stage');
    });

    it('без «ОП Основная» на портале — понятная ошибка', () => {
        const empty = {
            getDealCategoryByCode: () => undefined,
        } as unknown as PortalModel;
        expect(
            () => new LeadClosingReader(bitrixWith([]).bitrix, empty),
        ).toThrow('ОП Основная');
    });
    it('сделка удалена — живая работа находится по «присоединённым лидам» (повторная заявка)', async () => {
        const { bitrix } = bitrixWith([
            deal({
                ID: 26951,
                STAGE_ID: 'C31:WARM',
                ASSIGNED_BY_ID: '437',
                UF_CRM_DEAL_JOINED_LEADS: 'L_3721,L_1',
            }),
        ]);
        const [result] = await new LeadClosingReader(bitrix, portal).read([
            lead({ dealId: 40521, companyId: 164591 }),
        ]);

        expect(result.decision).toEqual({
            target: 'lead_converted',
            linkDealId: 26951,
            reason: 'deleted_live_deal',
        });
        expect(result.linkDealAssignedId).toBe(437);
    });
    it('запасная связь — компания лида и кто стоит в её «Лид»', async () => {
        const { bitrix } = bitrixWith([
            deal({ ID: 10, STAGE_ID: 'C31:WARM', LEAD_ID: 99 }),
        ]);
        const [withCompany] = await new LeadClosingReader(bitrix, portal).read([
            lead({ companyId: 5 }),
        ]);
        const [without] = await new LeadClosingReader(bitrix, portal).read([
            lead({}),
        ]);

        expect(withCompany.linkCompany).toEqual({ id: 5, leadId: 42 });
        expect(without.linkCompany).toBeNull();
    });
});
