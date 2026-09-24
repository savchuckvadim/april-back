import {
    buildJoinPlan,
    IJoinDealSnapshot,
    IJoinSnapshot,
    JoinOp,
} from '../services/join-to-main.plan';
import { IJoinToMainItem } from '../dto/join-to-main.dto';

type Row = Record<string, unknown>;

/** Портал garant: поля связей, история, менеджер, данные заявки. */
const FIELDS: Record<string, string> = {
    to_base_sales: 'TO_BASE_SALES',
    deal_joined_leads: 'DEAL_JOINED_LEADS',
    deal_from_lead_id: 'DEAL_FROM_LEAD_ID',
    op_mhistory: 'OP_MHISTORY',
    manager_op: 'MANAGER_OP',
    lead_order_number: 'LEAD_ORDER_NUMBER',
    op_lead_phones: 'OP_LEAD_PHONES',
    op_lead_emails: 'OP_LEAD_EMAILS',
};

const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        FIELDS[code] ? { bitrixId: FIELDS[code], items: [] } : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => 'Europe/Moscow',
    getDealCategoryByCode: (code: string) =>
        code === 'sales_base'
            ? {
                  bitrixId: '31',
                  stages: [
                      { code: 'sales_new', bitrixId: 'NEW' },
                      { code: 'sales_double', bitrixId: 'DOUBLE' },
                  ],
              }
            : undefined,
};

const DOMAIN = 'd.b24.ru';

/** Сделки 87955 → 42423 (24.09.2026): новая заявка того же клиента. */
const source = (over: Partial<IJoinDealSnapshot> = {}): IJoinDealSnapshot => ({
    id: 87955,
    title: 'Ряполова Ирина Николаевна (3269696)',
    categoryId: 31,
    stageId: 'C31:NEW',
    closed: false,
    responsibleId: 387,
    companyId: null,
    contactIds: [288609],
    leadIds: [348945],
    row: {
        ID: '87955',
        UF_CRM_LEAD_ORDER_NUMBER: '3269696',
        UF_CRM_OP_LEAD_PHONES: ['+79525932773'],
        UF_CRM_OP_LEAD_EMAILS: ['r@admlr.lipetsk.ru'],
        UF_CRM_OP_MHISTORY: [],
    },
    ...over,
});

const main = (over: Partial<IJoinDealSnapshot> = {}): IJoinDealSnapshot => ({
    id: 42423,
    title: 'МИНИМУЩЕСТВА ВО',
    categoryId: 31,
    stageId: 'C31:WARM',
    closed: false,
    responsibleId: 387,
    companyId: 167119,
    contactIds: [282699],
    leadIds: [339193],
    row: {
        ID: '42423',
        UF_CRM_DEAL_JOINED_LEADS: ['L_339193'],
        UF_CRM_OP_MHISTORY: ['01.09.2026 10:00 — что-то было'],
    },
    ...over,
});

const item = (over: Partial<IJoinToMainItem> = {}): IJoinToMainItem => ({
    dealId: 87955,
    targetType: 'deal',
    targetId: 42423,
    closeAsDuplicate: true,
    ...over,
});

const snapshot = (over: Partial<IJoinSnapshot> = {}): IJoinSnapshot => ({
    item: item(),
    source: source(),
    main: main(),
    companyId: 167119,
    leads: [
        {
            id: 348945,
            row: {
                ID: '348945',
                ASSIGNED_BY_ID: '387',
                UF_CRM_TO_BASE_SALES: 'D_87955',
            },
        },
    ],
    contactCompanies: new Map([[288609, []]]),
    warnings: [],
    ...over,
});

const ofKind = <K extends JoinOp['kind']>(ops: JoinOp[], kind: K) =>
    ops.filter((op): op is Extract<JoinOp, { kind: K }> => op.kind === kind);

const dealFields = (ops: JoinOp[], dealId: number): Row =>
    ofKind(ops, 'dealUpdate').find(op => op.dealId === dealId)?.fields ?? {};

describe('buildJoinPlan', () => {
    it('контакты — в компанию и основную, лид — на основную, дубль — в «Дубль», основная — история и таймлайн', () => {
        const plan = buildJoinPlan(portal as never, DOMAIN, snapshot());

        expect(plan.skipped).toBe(false);
        expect(plan.mainDealId).toBe(42423);
        expect(plan.companyId).toBe(167119);
        expect(plan.responsibleId).toBe(387);

        expect(ofKind(plan.ops, 'contactCompany')).toEqual([
            { kind: 'contactCompany', contactId: 288609, companyId: 167119 },
        ]);
        expect(ofKind(plan.ops, 'dealContact')).toEqual([
            { kind: 'dealContact', dealId: 42423, contactId: 288609 },
        ]);
        expect(plan.contactsLinked).toBe(2);

        const mainFields = dealFields(plan.ops, 42423);
        expect(mainFields.UF_CRM_DEAL_JOINED_LEADS).toEqual([
            'L_339193',
            'L_348945',
        ]);
        expect(mainFields.COMPANY_ID).toBeUndefined(); // у основной компания есть
        const history = mainFields.UF_CRM_OP_MHISTORY as string[];
        expect(history[0]).toBe('01.09.2026 10:00 — что-то было');
        expect(history[1]).toContain('Присоединена сделка #87955');
        expect(history[1]).toContain('заявка №3269696');

        const lead = ofKind(plan.ops, 'leadUpdate')[0];
        expect(lead.leadId).toBe(348945);
        expect(lead.fields.UF_CRM_TO_BASE_SALES).toBe('D_42423');
        expect(lead.fields.ASSIGNED_BY_ID).toBeUndefined(); // тот же человек
        expect(plan.leadsRelinked).toBe(1);

        const sourceFields = dealFields(plan.ops, 87955);
        expect(sourceFields.STAGE_ID).toBe('C31:DOUBLE');
        expect(sourceFields.UF_CRM_TO_BASE_SALES).toBe('42423');
        expect(sourceFields.COMPANY_ID).toBe(167119);
        expect(String(sourceFields.UF_CRM_OP_MHISTORY)).toContain('#42423');
        expect(plan.closesAsDuplicate).toBe(true);

        const timeline = ofKind(plan.ops, 'timeline')[0];
        expect(timeline.dealId).toBe(42423);
        expect(timeline.comment).toContain('заявка №3269696');
        expect(timeline.comment).toContain('+79525932773');
        expect(timeline.comment).toContain('закрыта стадией «Дубль»');
    });

    it('другой ответственный у основной — лид и дубль переходят ему вместе с manager_op', () => {
        const plan = buildJoinPlan(
            portal as never,
            DOMAIN,
            snapshot({ main: main({ responsibleId: 11 }) }),
        );
        const lead = ofKind(plan.ops, 'leadUpdate')[0];
        expect(lead.fields.ASSIGNED_BY_ID).toBe(11);
        expect(lead.fields.UF_CRM_MANAGER_OP).toBe(11);
        expect(dealFields(plan.ops, 87955).ASSIGNED_BY_ID).toBe(11);
        expect(plan.responsibleId).toBe(11);
    });

    it('повтор по уже присоединённой сделке — ни одной команды (идемпотентность)', () => {
        const plan = buildJoinPlan(
            portal as never,
            DOMAIN,
            snapshot({
                source: source({
                    stageId: 'C31:DOUBLE',
                    companyId: 167119,
                    responsibleId: 387,
                    row: {
                        ID: '87955',
                        UF_CRM_TO_BASE_SALES: '42423',
                        UF_CRM_OP_MHISTORY: [
                            '— Присоединена к основной сделке #42423',
                        ],
                    },
                }),
                main: main({
                    contactIds: [282699, 288609],
                    row: {
                        ID: '42423',
                        UF_CRM_DEAL_JOINED_LEADS: ['L_339193', 'L_348945'],
                        UF_CRM_OP_MHISTORY: [
                            '— Присоединена сделка #87955 «…»',
                        ],
                    },
                }),
                leads: [
                    {
                        id: 348945,
                        row: {
                            ID: '348945',
                            ASSIGNED_BY_ID: '387',
                            UF_CRM_TO_BASE_SALES: 'D_42423',
                        },
                    },
                ],
                contactCompanies: new Map([[288609, [167119]]]),
            }),
        );
        expect(plan.skipped).toBe(false);
        expect(plan.ops).toEqual([]);
        expect(plan.closesAsDuplicate).toBe(false);
    });

    it('цель — компания без открытой сделки ОП: дубль остаётся основной и получает компанию', () => {
        const plan = buildJoinPlan(
            portal as never,
            DOMAIN,
            snapshot({
                item: item({ targetType: 'company', targetId: 91429 }),
                main: null,
                companyId: 91429,
            }),
        );
        expect(plan.skipped).toBe(false);
        expect(plan.mainDealId).toBeNull();
        expect(ofKind(plan.ops, 'contactCompany')).toEqual([
            { kind: 'contactCompany', contactId: 288609, companyId: 91429 },
        ]);
        expect(dealFields(plan.ops, 87955)).toEqual({ COMPANY_ID: 91429 });
        expect(ofKind(plan.ops, 'timeline')).toEqual([]);
        expect(plan.warnings.join(' ')).toContain('остаётся основной');
    });

    it('closeAsDuplicate=false — дубль не двигается по стадии, остальное как обычно', () => {
        const plan = buildJoinPlan(
            portal as never,
            DOMAIN,
            snapshot({ item: item({ closeAsDuplicate: false }) }),
        );
        expect(dealFields(plan.ops, 87955).STAGE_ID).toBeUndefined();
        expect(plan.closesAsDuplicate).toBe(false);
        expect(ofKind(plan.ops, 'timeline')[0].comment).toContain(
            'оставлена открытой',
        );
    });

    it.each([
        [
            'чужая воронка дубля',
            { source: source({ categoryId: 5 }) },
            'не в воронке ОП',
        ],
        ['основная закрыта', { main: main({ closed: true }) }, 'закрыта'],
        [
            'сделка и основная совпадают',
            { main: main({ id: 87955 }) },
            'совпадают',
        ],
        ['дубль не найден', { source: null }, 'не найдена'],
        ['основная не найдена', { main: null }, 'не найдена'],
    ] as const)('%s → пропуск с причиной', (_name, over, reason) => {
        const plan = buildJoinPlan(portal as never, DOMAIN, snapshot(over));
        expect(plan.skipped).toBe(true);
        expect(plan.ops).toEqual([]);
        expect(plan.warnings.join(' ')).toContain(reason);
    });
});
