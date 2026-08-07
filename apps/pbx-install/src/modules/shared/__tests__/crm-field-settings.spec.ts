import { ParseFieldsService } from '../parse-field-excel/services/parse-fields.service';
import { BxEntityFieldsInstallService } from '../entity/field/bx-entity-field-install.service';
import { Field } from '@lib/pbx-user-fields';

/**
 * Привязки crm-полей (SETTINGS): без них Битрикс МОЛЧА не сохраняет
 * значения вида `L_123` — граф связей «лид ↔ сделка» тихо не работал бы.
 */
describe('crm-поля: привязки SETTINGS', () => {
    const field = (over: Partial<Field> = {}): Field =>
        ({
            name: 'Лид из которого была создана сделка',
            appType: 'lead',
            type: 'crm',
            list: [],
            code: 'deal_from_lead_id',
            bxFieldName: 'DEAL_FROM_LEAD_ID',
            order: 660,
            isNeedUpdate: true,
            isMultiple: false,
            ...over,
        }) as Field;

    const payloadOf = (parseField: Field) => {
        const service = Object.create(
            BxEntityFieldsInstallService.prototype,
        ) as BxEntityFieldsInstallService;
        return (
            service as unknown as {
                getBxFieldDataByParseField: (
                    f: Field,
                ) => Record<string, unknown>;
            }
        ).getBxFieldDataByParseField(parseField);
    };

    it('crm-поле без crmEntities получает ВСЕ четыре привязки (дефолт-максимум)', () => {
        const payload = payloadOf(field());
        expect(payload.SETTINGS).toEqual({
            LEAD: 'Y',
            CONTACT: 'Y',
            COMPANY: 'Y',
            DEAL: 'Y',
        });
    });

    it('crm-поле с crmEntities получает только перечисленные привязки', () => {
        const payload = payloadOf(field({ crmEntities: ['LEAD'] }));
        expect(payload.SETTINGS).toEqual({
            LEAD: 'Y',
            CONTACT: 'N',
            COMPANY: 'N',
            DEAL: 'N',
        });
    });

    it('не-crm поле SETTINGS не получает (регрессия: payload не менялся)', () => {
        const payload = payloadOf(field({ type: 'string' }));
        expect(payload.SETTINGS).toBeUndefined();
    });

    it('parseCrmEntities: CSV в любом регистре, мусор отбрасывается, пусто → undefined', () => {
        const service = Object.create(
            ParseFieldsService.prototype,
        ) as ParseFieldsService;
        const parse = (raw: unknown) =>
            (
                service as unknown as {
                    parseCrmEntities: (r: unknown) => unknown;
                }
            ).parseCrmEntities(raw);

        expect(parse('lead, deal')).toEqual(['LEAD', 'DEAL']);
        expect(parse('LEAD')).toEqual(['LEAD']);
        expect(parse('банан, LEAD')).toEqual(['LEAD']);
        expect(parse('')).toBeUndefined();
        expect(parse(undefined)).toBeUndefined();
        expect(parse('банан')).toBeUndefined();
    });
});
