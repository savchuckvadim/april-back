import { EventReportContactMirrorModel } from '../services/entity/event-report-contact-mirror.model';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Зеркало полей со сделки в КОНТАКТ события (задача владельца 01.09.2026).
 *
 * Политика намеренно ОБРАТНАЯ бэкфиллу компании: тот заполняет только
 * пустоту, а здесь значение перезаписывается — возражение меняется от
 * звонка к звонку, и «что мешает СЕЙЧАС» обязано отражать последний
 * разговор. Что общее: пустое не пишется никогда, а справочник переносится
 * через коды items, потому что числовые id у сделки и контакта разные.
 */

const FIELDS: Record<string, Record<string, unknown>> = {
    'deal:op_objection_reason': {
        bitrixId: 'OP_OBJECTION_REASON',
        type: 'enumeration',
        items: [
            { code: 'op_objection_nomoney', bitrixId: 101 },
            { code: 'op_objection_notime', bitrixId: 102 },
            { code: 'op_objection_lpr', bitrixId: 103 },
        ],
    },
    'contact:op_objection_reason': {
        bitrixId: 'OP_OBJECTION_REASON',
        type: 'enumeration',
        items: [
            { code: 'op_objection_nomoney', bitrixId: 201 },
            { code: 'op_objection_notime', bitrixId: 202 },
            // op_objection_lpr на контакте не установлен — item обязан выпасть.
        ],
    },
    'deal:op_objection_comment': {
        bitrixId: 'OP_OBJECTION_COMMENT',
        type: 'string',
        items: [],
    },
    'contact:op_objection_comment': {
        bitrixId: 'OP_OBJECTION_COMMENT',
        type: 'string',
        items: [],
    },
    'deal:op_sale_date_prognoz': {
        bitrixId: 'OP_SALE_DATE_PROGNOZ',
        type: 'date',
        items: [],
    },
    'contact:op_sale_date_prognoz': {
        bitrixId: 'OP_SALE_DATE_PROGNOZ',
        type: 'date',
        items: [],
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
    }) as unknown as PortalModel;

const DEAL = {
    ID: '5512',
    UF_CRM_OP_OBJECTION_REASON: ['101', '102'],
    UF_CRM_OP_OBJECTION_COMMENT: 'сказал, что в этом году бюджета нет',
    UF_CRM_OP_SALE_DATE_PROGNOZ: '01.10.2026',
};

const build = (
    contact: Record<string, unknown>,
    portal = makePortal(),
    deal: Record<string, unknown> = DEAL,
) => new EventReportContactMirrorModel(portal, contact, deal).toFields();

describe('EventReportContactMirrorModel', () => {
    it('переносит возражения, формулировку и дату покупки в контакт', () => {
        const fields = build({ ID: '77' });

        expect(fields).toEqual({
            // Справочник переехал ЧЕРЕЗ КОДЫ: id сделки 101/102 → id контакта
            // 201/202. Прямой перенос записал бы в контакт чужие значения.
            UF_CRM_OP_OBJECTION_REASON: ['201', '202'],
            UF_CRM_OP_OBJECTION_COMMENT: 'сказал, что в этом году бюджета нет',
            UF_CRM_OP_SALE_DATE_PROGNOZ: '01.10.2026',
        });
    });

    it('элемент справочника без пары по коду выпадает', () => {
        const fields = build(
            { ID: '77' },
            makePortal(),
            { ...DEAL, UF_CRM_OP_OBJECTION_REASON: ['101', '103'] },
        );

        // 103 (op_objection_lpr) на контакте не установлен — остаётся один.
        expect(fields.UF_CRM_OP_OBJECTION_REASON).toEqual(['201']);
    });

    it('ни одной пары по коду — поле не пишется вовсе', () => {
        const fields = build({ ID: '77' }, makePortal(), {
            ...DEAL,
            UF_CRM_OP_OBJECTION_REASON: ['103'],
        });

        expect(fields).not.toHaveProperty('UF_CRM_OP_OBJECTION_REASON');
    });

    it('ПЕРЕЗАПИСЫВАЕТ непустое значение контакта — в отличие от бэкфилла', () => {
        // Возражение меняется от звонка к звонку: прошлое остаётся в оси
        // событий клиента, а поле показывает то, что мешает сейчас.
        const fields = build({
            ID: '77',
            UF_CRM_OP_OBJECTION_COMMENT: 'прошлое возражение',
        });

        expect(fields.UF_CRM_OP_OBJECTION_COMMENT).toBe(
            'сказал, что в этом году бюджета нет',
        );
    });

    it('пустое значение сделки не стирает то, что уже есть в контакте', () => {
        const fields = build({ ID: '77' }, makePortal(), {
            ID: '5512',
            UF_CRM_OP_OBJECTION_COMMENT: '   ',
            UF_CRM_OP_OBJECTION_REASON: [],
        });

        expect(fields).toEqual({});
    });

    it('одинаковое значение команду не выпускает — лента карточки не шумит', () => {
        const fields = build({
            ID: '77',
            UF_CRM_OP_OBJECTION_REASON: ['202', '201'],
            UF_CRM_OP_OBJECTION_COMMENT: 'сказал, что в этом году бюджета нет',
            UF_CRM_OP_SALE_DATE_PROGNOZ: '01.10.2026',
        });

        // Порядок значений множественного поля значения не имеет.
        expect(fields).toEqual({});
    });

    it('поля нет на контакте — блок молчит, релиза под установку не нужно', () => {
        const fields = build(
            { ID: '77' },
            makePortal([
                'contact:op_objection_reason',
                'contact:op_sale_date_prognoz',
            ]),
        );

        expect(Object.keys(fields)).toEqual(['UF_CRM_OP_OBJECTION_COMMENT']);
    });

    it('поля нет на сделке — читать нечего', () => {
        const fields = build({ ID: '77' }, makePortal(['deal:op_objection_reason']));

        expect(fields).not.toHaveProperty('UF_CRM_OP_OBJECTION_REASON');
    });
});
