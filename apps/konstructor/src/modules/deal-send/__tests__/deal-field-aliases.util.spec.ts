import { DealSendFieldDto } from '../dto/deal-send.dto';
import { applyDealFieldAliases } from '../lib/deal-field-aliases.util';

const field = (code: string, value: string): DealSendFieldDto =>
    ({ code, appType: 'product', value }) as DealSendFieldDto;

const portalHas =
    (...codes: string[]) =>
    (code: string): boolean =>
        codes.includes(code);

/**
 * quantity_for_kp — то же значение, что offer_supply_q (UF_CRM_1689656448):
 * легаси писал его туда, шаблоны читают оттуда.
 */
describe('applyDealFieldAliases: quantity_for_kp → offer_supply_q', () => {
    const quantity = field(
        'quantity_for_kp',
        'Интернет версия на 1 одновременный доступ к системе',
    );

    it('поле offer_supply_q на портале есть — пишем в него', () => {
        const [result] = applyDealFieldAliases(
            [quantity],
            portalHas('offer_supply_q'),
        );

        expect(result.code).toBe('offer_supply_q');
        expect(result.value).toBe(quantity.value);
    });

    it('поля offer_supply_q нет — код остаётся как пришёл', () => {
        const [result] = applyDealFieldAliases([quantity], portalHas());

        expect(result.code).toBe('quantity_for_kp');
    });

    it('offer_supply_q прислан явно — он сильнее, quantity_for_kp отбрасываем', () => {
        const explicit = field('offer_supply_q', 'явное значение');

        const result = applyDealFieldAliases(
            [quantity, explicit],
            portalHas('offer_supply_q'),
        );

        expect(result).toEqual([explicit]);
    });

    it('остальные поля не трогаем', () => {
        const other = field('complect_name', 'Гарант-Офис');

        const result = applyDealFieldAliases(
            [other, quantity],
            portalHas('offer_supply_q'),
        );

        expect(result.map(item => item.code)).toEqual([
            'complect_name',
            'offer_supply_q',
        ]);
    });
});
