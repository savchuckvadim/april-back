import {
    EContactRole,
    EventReportContactFieldsModel,
    resolveEventContacts,
} from '../services/entity/event-report-contact-fields.model';
import { EventReportEntityFlowService } from '../services/entity/event-report-entity-flow.service';
import { EventReportContext } from '../services/context/event-report.context';

/**
 * Модель полей КОНТАКТА события (02.09.2026): отдельная от модели сущностей,
 * два контакта на отчёт (с кем говорили / кому планируют), самогейт по
 * слепку, факты отчёта — из контекста, возражение и дата — со сделки.
 */

type Field = {
    bitrixId: string;
    type: string;
    items: Array<{ code: string; bitrixId: number }>;
};

const CONTACT_FIELDS: Record<string, Field> = {
    op_mhistory: { bitrixId: 'OP_MHISTORY', type: 'multiple', items: [] },
    op_history: { bitrixId: 'OP_HISTORY', type: 'string', items: [] },
    pres_count: { bitrixId: 'PRES_COUNT', type: 'integer', items: [] },
    op_presentation_xvost: {
        bitrixId: 'OP_PRESENTATION_XVOST',
        type: 'string',
        items: [],
    },
    op_5k_client: { bitrixId: 'OP_5K_CLIENT', type: 'string', items: [] },
    op_efield_fail_reason: {
        bitrixId: 'OP_EFIELD_FAIL_REASON',
        type: 'enumeration',
        items: [{ code: 'op_efield_fail_nomoney', bitrixId: 901 }],
    },
    op_fail_comments: {
        bitrixId: 'OP_FAIL_COMMENTS',
        type: 'multiple',
        items: [],
    },
    op_objection_reason: {
        bitrixId: 'OP_OBJECTION_REASON',
        type: 'enumeration',
        items: [{ code: 'op_objection_nomoney', bitrixId: 201 }],
    },
    op_sale_date_prognoz: {
        bitrixId: 'OP_SALE_DATE_PROGNOZ',
        type: 'date',
        items: [],
    },
    call_next_date: { bitrixId: 'CALL_NEXT_DATE', type: 'datetime', items: [] },
    call_next_name: { bitrixId: 'CALL_NEXT_NAME', type: 'string', items: [] },
};

const DEAL_FIELDS: Record<string, Field> = {
    op_objection_reason: {
        bitrixId: 'OP_OBJECTION_REASON',
        type: 'enumeration',
        items: [{ code: 'op_objection_nomoney', bitrixId: 101 }],
    },
    op_sale_date_prognoz: {
        bitrixId: 'OP_SALE_DATE_PROGNOZ',
        type: 'date',
        items: [],
    },
};

/** Слепок портала: контакт — по списку, сделка — только зеркалируемые. */
const makePortal = (contactCodes: string[] = Object.keys(CONTACT_FIELDS)) => ({
    getEntityFieldByCode: (entity: string, code: string) => {
        if (entity === 'contact') {
            return contactCodes.includes(code) ? CONTACT_FIELDS[code] : undefined;
        }
        if (entity === 'deal') return DEAL_FIELDS[code];
        return undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) => `UF_CRM_${field.bitrixId}`,
    getFieldItemByCode: (field: Field, code: string) =>
        field.items.find(item => item.code === code),
    getPortal: () => ({ domain: 'd.b24.ru' }),
    getTimezone: () => 'Europe/Moscow',
});

const REPORT_CONTACT = { ID: '77', NAME: 'Иван', UF_CRM_OP_HISTORY: 'прошлая' };
const PLAN_CONTACT = { ID: '88', NAME: 'Пётр' };
const DEAL = {
    ID: '5512',
    UF_CRM_OP_OBJECTION_REASON: ['101'],
    UF_CRM_OP_SALE_DATE_PROGNOZ: '01.10.2026',
};

const makeCtx = (
    dto: Record<string, unknown>,
    init: Record<string, unknown> = {},
    portal: unknown = makePortal(),
) =>
    new EventReportContext(
        {
            currentTask: { eventType: 'refine', name: 'ООО Ромашка' },
            report: {
                resultStatus: 'result',
                description: 'Клиент думает',
                workStatus: { current: { code: 'inJob' } },
            },
            plan: {
                isPlanned: true,
                isActive: true,
                name: 'Перезвонить по КП',
                deadline: '2026-09-10 12:00:00',
                type: { current: { code: 'hot' } },
            },
            ...dto,
        } as never,
        portal as never,
        {
            entityType: 'company',
            entityId: 7,
            company: { ID: '7' },
            lead: null,
            currentBaseDeal: DEAL,
            reportContact: REPORT_CONTACT,
            planContact: PLAN_CONTACT,
            ...init,
        } as never,
        new Date('2026-09-02T09:00:00.000Z'),
    );

const fieldsOf = (
    ctx: EventReportContext,
    contact: Record<string, unknown>,
    roles: Array<(typeof EContactRole)[keyof typeof EContactRole]>,
    portal: unknown = makePortal(),
) =>
    new EventReportContactFieldsModel(
        portal as never,
        ctx,
        contact,
        new Set(roles),
    ).toFields();

describe('EventReportContactFieldsModel', () => {
    it('контакт отчёта: история лентой и скаляром через « | », возражение и дата со сделки', () => {
        const out = fieldsOf(makeCtx({}), REPORT_CONTACT, [EContactRole.REPORT]);

        const history = out.UF_CRM_OP_MHISTORY as string[];
        expect(history).toHaveLength(1);
        expect(history[0]).toContain('Клиент думает');
        // Скаляр: новая запись ВПЕРЁД прошлого значения.
        expect(String(out.UF_CRM_OP_HISTORY)).toMatch(/^.+ \| прошлая$/);

        // Возражение — через КОД элемента: id сделки 101 → id контакта 201.
        expect(out.UF_CRM_OP_OBJECTION_REASON).toEqual(['201']);
        expect(out.UF_CRM_OP_SALE_DATE_PROGNOZ).toBe('01.10.2026');

        // Оси следующего звонка у контакта отчёта нет — это роль плана.
        expect(out.UF_CRM_CALL_NEXT_DATE).toBeUndefined();
    });

    it('контакт плана: история и ось следующего звонка, без фактов разговора', () => {
        const out = fieldsOf(makeCtx({}), PLAN_CONTACT, [EContactRole.PLAN]);

        expect(out.UF_CRM_OP_MHISTORY).toHaveLength(1);
        expect(out.UF_CRM_CALL_NEXT_NAME).toBe('Перезвонить по КП');
        expect(String(out.UF_CRM_CALL_NEXT_DATE)).toContain('10.09.2026');
        expect(out.UF_CRM_OP_OBJECTION_REASON).toBeUndefined();
        expect(out.UF_CRM_OP_SALE_DATE_PROGNOZ).toBeUndefined();
    });

    it('презентация с этим человеком: счётчик +1, сводки и блоки анкеты из payload', () => {
        const ctx = makeCtx({
            currentTask: { eventType: 'presentation', name: 'ООО Ромашка' },
            presentation: {
                isPresentationDone: true,
                survey: {
                    xvost: 'Дожать через неделю',
                    fiveK: { op_5k_client: 'Хочет замену & скидку 50%' },
                },
            },
        });
        const out = fieldsOf(
            ctx,
            { ...REPORT_CONTACT, UF_CRM_PRES_COUNT: '2' },
            [EContactRole.REPORT],
        );

        expect(out.UF_CRM_PRES_COUNT).toBe(3);
        expect(out.UF_CRM_OP_PRESENTATION_XVOST).toBe('Дожать через неделю');
        // Свободный текст — строгое экранирование batch-провода.
        expect(out.UF_CRM_OP_5K_CLIENT).toBe('Хочет замену %26 скидку 50%25');
    });

    it('отказ с участием этого человека: причина справочником и лента отказов', () => {
        const ctx = makeCtx({
            report: {
                resultStatus: 'result',
                description: 'Нет бюджета',
                workStatus: { current: { code: 'fail' } },
                failType: { current: { code: 'failure' } },
                failReason: { current: { code: 'nomoney' } },
            },
            plan: { isPlanned: false, isActive: false },
        });
        const out = fieldsOf(ctx, REPORT_CONTACT, [EContactRole.REPORT]);

        expect(out.UF_CRM_OP_EFIELD_FAIL_REASON).toBe(901);
        const fails = out.UF_CRM_OP_FAIL_COMMENTS as string[];
        expect(fails[0]).toContain('Отказ: Нет бюджета');
    });

    it('самогейт: на контакте не установлено ни одного поля — команды нет', () => {
        const empty = makePortal([]);
        const out = fieldsOf(
            makeCtx({}, {}, empty),
            REPORT_CONTACT,
            [EContactRole.REPORT],
            empty,
        );

        expect(out).toEqual({});
    });
});

describe('resolveEventContacts', () => {
    it('два разных контакта — две записи со своими ролями', () => {
        const contacts = resolveEventContacts(makeCtx({}));

        expect(contacts.map(c => c.contact.ID)).toEqual(['77', '88']);
        expect([...contacts[0]!.roles]).toEqual([EContactRole.REPORT]);
        expect([...contacts[1]!.roles]).toEqual([EContactRole.PLAN]);
    });

    it('один человек в обеих ролях — одна запись с двумя ролями', () => {
        const contacts = resolveEventContacts(
            makeCtx({}, { planContact: REPORT_CONTACT }),
        );

        expect(contacts).toHaveLength(1);
        expect([...contacts[0]!.roles].sort()).toEqual(['plan', 'report']);
    });

    it('контактов нет — пусто', () => {
        expect(
            resolveEventContacts(
                makeCtx({}, { reportContact: null, planContact: null }),
            ),
        ).toEqual([]);
    });
});

describe('EventReportEntityFlowService × контакты', () => {
    it('по команде на контакт, ключ update_contact_<id>', () => {
        const contactUpdates: Array<{ cmd: string; id: number }> = [];
        const bitrix = {
            batch: {
                company: { update: () => undefined },
                lead: { update: () => undefined },
                deal: { update: () => undefined },
                contact: {
                    update: (cmd: string, id: number) =>
                        contactUpdates.push({ cmd, id }),
                },
            },
        };
        const portal = makePortal();

        new EventReportEntityFlowService(bitrix as never, portal as never).queue(
            makeCtx({}, {}, portal),
        );

        expect(contactUpdates).toEqual([
            { cmd: 'update_contact_77', id: 77 },
            { cmd: 'update_contact_88', id: 88 },
        ]);
    });
});
