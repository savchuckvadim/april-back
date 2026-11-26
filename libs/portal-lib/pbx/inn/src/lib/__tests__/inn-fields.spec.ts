import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { InnFieldMap, parseInnLegacyFieldNames } from '../inn-fields';
import { fieldInns, observeInnGraph } from '../inn-observe.util';
import { INN_SOURCE_KINDS } from '../../type/inn.type';

/** Портал, где наши поля ИНН стоят во всех сущностях. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as unknown as PortalModel;

const GSIRK_INN = '4205220212';
const SECOND_INN = '420536405891';

describe('parseInnLegacyFieldNames: значение настройки → имена полей', () => {
    it('запятые, пробелы, регистр и повторы', () => {
        expect(
            parseInnLegacyFieldNames(
                ' uf_crm_1695372881, UF_CRM_5AF9505846BAD;UF_CRM_1695372881 ',
            ),
        ).toEqual(['UF_CRM_1695372881', 'UF_CRM_5AF9505846BAD']);
    });

    it('не пользовательские поля и мусор отбрасываются', () => {
        expect(
            parseInnLegacyFieldNames('TITLE, UF_CRM_, ИНН, UF_CRM_12-3'),
        ).toEqual([]);
        expect(parseInnLegacyFieldNames(undefined)).toEqual([]);
    });
});

describe('InnFieldMap.legacy', () => {
    it('старые поля по сущностям; наше поле «ИНН» среди них пропускается', () => {
        const fields = InnFieldMap.from(portal, {
            deal: ['UF_CRM_1695372881', 'UF_CRM_OP_INN'],
            company: ['UF_CRM_1400482437'],
        });
        expect(fields.legacy('deal')).toEqual(['UF_CRM_1695372881']);
        expect(fields.legacy('company')).toEqual(['UF_CRM_1400482437']);
        expect(fields.legacy('lead')).toEqual([]);
        // наши поля не меняются
        expect(fields.inn('deal')).toBe('UF_CRM_OP_INN');
    });

    it('без настройки старых полей нет', () => {
        expect(InnFieldMap.from(portal).legacy('deal')).toEqual([]);
    });
});

describe('observeInnGraph: старые поля портала', () => {
    it('поле сделки — «из карточки сделки», компании — «из карточки компании», лида — «из заявки»', () => {
        const fields = InnFieldMap.from(portal, {
            deal: ['UF_CRM_DEAL_OLD'],
            company: ['UF_CRM_COMPANY_OLD'],
            lead: ['UF_CRM_LEAD_OLD'],
        });
        const found = observeInnGraph(
            {
                dealId: 1,
                deal: { ID: '1', UF_CRM_DEAL_OLD: GSIRK_INN },
                company: {
                    ID: '2',
                    TITLE: 'Ромашка',
                    UF_CRM_COMPANY_OLD: `${GSIRK_INN}, ${SECOND_INN}`,
                },
                leads: [{ ID: '3', UF_CRM_LEAD_OLD: SECOND_INN }],
            },
            fields,
        );
        const kinds = found.map(item => `${item.kind}:${item.inn}`);
        expect(kinds).toEqual(
            expect.arrayContaining([
                `${INN_SOURCE_KINDS.deal_card}:${GSIRK_INN}`,
                `${INN_SOURCE_KINDS.company_field}:${GSIRK_INN}`,
                `${INN_SOURCE_KINDS.company_field}:${SECOND_INN}`,
                `${INN_SOURCE_KINDS.lead_field}:${SECOND_INN}`,
            ]),
        );
    });

    it('fieldInns: несколько ИНН в одном поле — каждый отдельно', () => {
        expect(
            fieldInns({ F: `${GSIRK_INN}, ${SECOND_INN}` }, ['F']).sort(),
        ).toEqual([GSIRK_INN, SECOND_INN].sort());
    });
});
