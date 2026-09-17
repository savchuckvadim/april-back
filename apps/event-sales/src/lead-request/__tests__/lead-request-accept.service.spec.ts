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
    op_lead_accepted_by: { bitrixId: 'OP_LEAD_ACCEPTED_BY' },
    to_base_sales: { bitrixId: 'TO_BASE_SALES' },
    op_mhistory: { bitrixId: 'OP_MHISTORY' },
    manager_op: { bitrixId: 'MANAGER_OP' },
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
    getDealCategoryByCode: () => ({
        bitrixId: '3',
        stages: [{ code: 'sales_cold', bitrixId: 'COLD' }],
    }),
});

type LeadUpdateMock = jest.Mock<
    Promise<unknown>,
    [number, Record<string, unknown>]
>;

const makePbx = (
    leadRow: Record<string, unknown>,
    dealRow: Record<string, unknown> | null = null,
) => {
    const update: LeadUpdateMock = jest
        .fn<Promise<unknown>, [number, Record<string, unknown>]>()
        .mockResolvedValue({});
    const dealUpdate: LeadUpdateMock = jest
        .fn<Promise<unknown>, [number, Record<string, unknown>]>()
        .mockResolvedValue({});
    const dealGet = jest
        .fn()
        .mockResolvedValue({ result: dealRow ?? undefined });
    return {
        update,
        dealUpdate,
        dealGet,
        pbx: {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    lead: {
                        get: jest.fn().mockResolvedValue({ result: leadRow }),
                        update,
                    },
                    deal: { get: dealGet, update: dealUpdate },
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
        // Ось слита (2408): site_stage больше не пишется.
        expect(fields.UF_CRM_OP_LEAD_SITE_STAGE).toBeUndefined();
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

    /*
     * Менеджер живёт в воронке сделок и в лид не заходит: путь заявки
     * должен быть виден и в сделке. Пишем в op_mhistory — общее поле
     * истории ОП, поэтому события заявки встают в одну ленту с отчётами.
     */
    it('зеркалит принятие в сделку: стадия «Холодная» + запись истории', async () => {
        const { pbx, dealUpdate } = makePbx(
            {
                ID: '42',
                UF_CRM_TO_BASE_SALES: 'D_1024',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
            },
            { ID: '1024', UF_CRM_OP_MHISTORY: ['старое событие сделки'] },
        );
        const service = new LeadRequestAcceptService(pbx as never);

        await service.accept({ domain: 'd.b24.ru', leadId: 42, userId: 5 });

        const [dealId, fields] = dealUpdate.mock.calls[0];
        expect(dealId).toBe(1024);
        expect(fields.STAGE_ID).toBe('C3:COLD');
        const dealHistory = fields.UF_CRM_OP_MHISTORY as string[];
        // Multiple-поле перезаписывается целиком — прошлое обязано уцелеть.
        expect(dealHistory[0]).toBe('старое событие сделки');
        expect(dealHistory[1]).toContain('Заявка принята в работу: 5');
    });

    /*
     * Сделку не прочитали (её нет/недоступна) — историю не трогаем вовсе:
     * запись вслепую стёрла бы всю прошлую историю сделки.
     */
    it('сделка не прочитана → двигаем стадию, историю не пишем', async () => {
        const { pbx, dealUpdate } = makePbx({
            ID: '42',
            UF_CRM_TO_BASE_SALES: 'D_1024',
            UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
        });
        const service = new LeadRequestAcceptService(pbx as never);

        await service.accept({ domain: 'd.b24.ru', leadId: 42, userId: 5 });

        const [, fields] = dealUpdate.mock.calls[0];
        expect(fields.STAGE_ID).toBe('C3:COLD');
        expect(fields.UF_CRM_OP_MHISTORY).toBeUndefined();
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

    it('пишет «Кто принял» на лид и на основную сделку', async () => {
        const { pbx, update, dealUpdate } = makePbx(
            {
                ID: '42',
                UF_CRM_TO_BASE_SALES: 'D_1024',
                UF_CRM_OP_LEAD_ASSIGNED_AT: '01.08.2026 10:00:00',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
            },
            { ID: '1024' },
        );
        const service = new LeadRequestAcceptService(pbx as never);

        await service.accept({ domain: 'd.b24.ru', leadId: 42, userId: 7 });

        expect(update.mock.calls[0][1].UF_CRM_OP_LEAD_ACCEPTED_BY).toBe(7);
        const [, dealFields] = dealUpdate.mock.calls[0];
        expect(dealFields.UF_CRM_OP_LEAD_ACCEPTED_BY).toBe(7);
        expect(dealFields.UF_CRM_OP_LEAD_ASSIGNED_AT).toBe('');
    });

    /*
     * Карточка решает по таймеру. Если история уже говорит «принята», а
     * таймер заполнен, кнопка раньше отвечала already и ничего не писала —
     * экран подтверждения возвращался бесконечно.
     */
    it('по истории принята, но таймер заполнен — принимаем и снимаем таймер', async () => {
        const { pbx, update } = makePbx({
            ID: '42',
            UF_CRM_OP_LEAD_ASSIGNED_AT: '16.09.2026 16:20:47',
            UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [
                ASSIGNED_ENTRY,
                ACCEPTED_ENTRY,
            ],
        });
        const service = new LeadRequestAcceptService(pbx as never);

        const result = await service.accept({
            domain: 'd.b24.ru',
            leadId: 42,
            userId: 9,
        });

        expect(result.already).toBe(false);
        const fields = update.mock.calls[0][1];
        expect(fields.UF_CRM_OP_LEAD_ASSIGNED_AT).toBe('');
        expect(fields.UF_CRM_OP_LEAD_ACCEPTED_BY).toBe(9);
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

/*
 * «Менеджер по продажам Гарант» (manager_op) идёт за принявшим: решение
 * владельца 17.09 — менеджером в карточке стоит тот, кто работу взял.
 */
describe('LeadRequestAcceptService — менеджер по продажам', () => {
    it('ставит manager_op = принявший на лиде и основной сделке', async () => {
        const { pbx, update, dealUpdate } = makePbx(
            {
                ID: '42',
                ASSIGNED_BY_ID: '5',
                UF_CRM_TO_BASE_SALES: 'D_1024',
                UF_CRM_OP_LEAD_ASSIGNED_AT: '01.08.2026 10:00:00',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
            },
            { ID: '1024' },
        );
        const service = new LeadRequestAcceptService(pbx as never);

        await service.accept({ domain: 'd.b24.ru', leadId: 42, userId: 7 });

        expect(update.mock.calls[0][1].UF_CRM_MANAGER_OP).toBe(7);
        expect(dealUpdate.mock.calls[0][1].UF_CRM_MANAGER_OP).toBe(7);
    });

    it('без userId менеджером становится ответственный лида (вебхук робота)', () => {
        const plan = new LeadRequestAcceptService(null as never).plan(
            makePortal() as never,
            {
                ID: '42',
                ASSIGNED_BY_ID: '5',
                UF_CRM_TO_BASE_SALES: 'D_1024',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
            },
        );

        expect(plan.fields.UF_CRM_MANAGER_OP).toBe(5);
        expect(plan.dealUpdate?.fields.UF_CRM_MANAGER_OP).toBe(5);
    });

    it('принятие сделки без лида тоже ставит менеджера', () => {
        const plan = new LeadRequestAcceptService(null as never).planDealOnly(
            makePortal() as never,
            1024,
            {
                ID: '1024',
                ASSIGNED_BY_ID: '8',
                UF_CRM_OP_LEAD_ASSIGNED_AT: '10.08.2026 10:00:00',
            },
            9,
        );

        expect(plan.dealUpdate?.fields.UF_CRM_MANAGER_OP).toBe(9);
    });

    it('поле не установлено на портале — молча пропуск', () => {
        const portal = {
            ...makePortal(),
            getEntityFieldByCode: (entity: string, code: string) =>
                code === 'manager_op'
                    ? undefined
                    : makePortal().getEntityFieldByCode(entity, code),
        };
        const plan = new LeadRequestAcceptService(null as never).plan(
            portal as never,
            {
                ID: '42',
                UF_CRM_TO_BASE_SALES: 'D_1024',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [ASSIGNED_ENTRY],
            },
            7,
        );

        expect(plan.already).toBe(false);
        expect(plan.fields).not.toHaveProperty('UF_CRM_MANAGER_OP');
        expect(plan.dealUpdate?.fields).not.toHaveProperty('UF_CRM_MANAGER_OP');
    });

    it('повтор после принятия — менеджер не переписывается', () => {
        const plan = new LeadRequestAcceptService(null as never).plan(
            makePortal() as never,
            {
                ID: '42',
                UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: [
                    ASSIGNED_ENTRY,
                    ACCEPTED_ENTRY,
                ],
            },
            7,
        );

        expect(plan.already).toBe(true);
        expect(plan.fields).toEqual({});
    });
});
