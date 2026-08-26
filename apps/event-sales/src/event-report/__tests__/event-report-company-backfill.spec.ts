import { EventReportCompanyBackfillModel } from '../services/entity/event-report-company-backfill.model';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Политика вопроса №6 (todo2508): пустые РУЧНЫЕ поля компании заполняются
 * со сделки, НЕПУСТЫЕ — не перезатираются никогда. Enum переносится через
 * item-коды: числовые id у полей сделки и компании — разные справочники.
 */
const FIELDS: Record<string, Record<string, unknown>> = {
    'deal:op_sale_date_prognoz': {
        bitrixId: 'OP_SALE_DATE_PROGNOZ',
        type: 'date',
        items: [],
    },
    'company:op_sale_date_prognoz': {
        bitrixId: 'OP_SALE_DATE_PROGNOZ',
        type: 'date',
        items: [],
    },
    'deal:op_concurents_multiple': {
        bitrixId: 'OP_CONCURENTS_MULTIPLE',
        type: 'enumeration',
        items: [
            { code: 'garant', bitrixId: 101 },
            { code: 'kodex', bitrixId: 102 },
        ],
    },
    'company:op_concurents_multiple': {
        bitrixId: 'OP_CONCURENTS_MULTIPLE',
        type: 'enumeration',
        items: [
            { code: 'garant', bitrixId: 201 },
            // kodex на компании не установлен — item обязан выпасть.
        ],
    },
};

const makePortal = (missing: string[] = []) =>
    ({
        getEntityFieldByCode: (entity: string, code: string) => {
            const key = `${entity}:${code}`;
            if (missing.includes(key)) return undefined;
            return FIELDS[key];
        },
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
        getFieldItemByCode: (
            field: { items: Array<{ code: string; bitrixId: number }> },
            code: string,
        ) => field.items.find(item => item.code === code),
    }) as unknown as PortalModel;

const DEAL = {
    ID: '5512',
    UF_CRM_OP_SALE_DATE_PROGNOZ: '01.10.2026',
    UF_CRM_OP_CONCURENTS_MULTIPLE: [101, 102],
};

describe('EventReportCompanyBackfillModel', () => {
    it('пустые поля компании заполняются со сделки', () => {
        const model = new EventReportCompanyBackfillModel(
            makePortal(),
            { ID: '431' },
            DEAL,
        );
        const fields = model.toFields();

        expect(fields.UF_CRM_OP_SALE_DATE_PROGNOZ).toBe('01.10.2026');
        // enum-id переносится через код: 101(garant у сделки) → 201(у компании),
        // 102(kodex) пары не имеет и честно выпадает.
        expect(fields.UF_CRM_OP_CONCURENTS_MULTIPLE).toEqual([201]);
    });

    it('НЕПУСТОЕ значение компании не перезатирается никогда', () => {
        const model = new EventReportCompanyBackfillModel(
            makePortal(),
            {
                ID: '431',
                UF_CRM_OP_SALE_DATE_PROGNOZ: '15.09.2026',
                UF_CRM_OP_CONCURENTS_MULTIPLE: [201],
            },
            DEAL,
        );
        expect(model.toFields()).toEqual({});
    });

    it('пустая сделка не даёт полей (нечего заполнять)', () => {
        const model = new EventReportCompanyBackfillModel(
            makePortal(),
            { ID: '431' },
            { ID: '5512', UF_CRM_OP_CONCURENTS_MULTIPLE: [] },
        );
        expect(model.toFields()).toEqual({});
    });

    it('поле не установлено на одной из сущностей — код пропускается', () => {
        const model = new EventReportCompanyBackfillModel(
            makePortal(['company:op_sale_date_prognoz']),
            { ID: '431' },
            DEAL,
        );
        expect(model.toFields().UF_CRM_OP_SALE_DATE_PROGNOZ).toBeUndefined();
        expect(model.toFields().UF_CRM_OP_CONCURENTS_MULTIPLE).toEqual([201]);
    });

    it('enum без единой пары по кодам — поле не пишется вовсе', () => {
        const model = new EventReportCompanyBackfillModel(
            makePortal(),
            { ID: '431' },
            { ID: '5512', UF_CRM_OP_CONCURENTS_MULTIPLE: [102] },
        );
        expect(model.toFields().UF_CRM_OP_CONCURENTS_MULTIPLE).toBeUndefined();
    });

    it('нулевая пустота Битрикса ("0", "") считается пустой', () => {
        const model = new EventReportCompanyBackfillModel(
            makePortal(),
            {
                ID: '431',
                UF_CRM_OP_SALE_DATE_PROGNOZ: '',
                UF_CRM_OP_CONCURENTS_MULTIPLE: ['0'],
            },
            DEAL,
        );
        const fields = model.toFields();
        expect(fields.UF_CRM_OP_SALE_DATE_PROGNOZ).toBe('01.10.2026');
        expect(fields.UF_CRM_OP_CONCURENTS_MULTIPLE).toEqual([201]);
    });
});
