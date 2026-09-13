import { resolveInitDealFlow } from '../lib/resolve-init-deal-flow';

/**
 * Сценарий определяется по флагу RPA «Перезаключение?» — тому же полю, по
 * которому пользователь фильтрует поставки от перезаключений.
 */
describe('resolveInitDealFlow', () => {
    it('явный flow перебивает всё', () => {
        expect(
            resolveInitDealFlow({
                explicit: 'supply',
                isExtension: true,
                hasOfferSmart: true,
            }),
        ).toBe('supply');
    });

    it('флаг «Перезаключение?» включён — перезаключение', () => {
        expect(
            resolveInitDealFlow({ isExtension: true, hasOfferSmart: false }),
        ).toBe('renewal');
    });

    it('флаг выключен — поставка, даже если смарт заполнен', () => {
        expect(
            resolveInitDealFlow({ isExtension: false, hasOfferSmart: true }),
        ).toBe('supply');
    });

    it('флага нет — падаем на «предложение на будущий период»', () => {
        expect(
            resolveInitDealFlow({ isExtension: null, hasOfferSmart: true }),
        ).toBe('renewal');
        expect(
            resolveInitDealFlow({ isExtension: null, hasOfferSmart: false }),
        ).toBe('supply');
    });
});
