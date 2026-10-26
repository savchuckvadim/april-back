import {
    COMPLECT_NUMBER_TO_CODE,
    LT_PACKAGE_NUMBER_TO_CODE,
    SUPPLY_NUMBER_TO_KEY,
    UNIVERSAL_COMPLECT_NUMBERS,
    supplyCodeFromNumber,
} from '../lib/catalog-codes';

describe('catalog-codes', () => {
    it('числовые поставки получают код вида <type>_<ОД>', () => {
        expect(supplyCodeFromNumber(1)).toBe('internet_1');
        expect(supplyCodeFromNumber(4)).toBe('internet_5');
        expect(supplyCodeFromNumber(11)).toBe('proxima_1');
        expect(supplyCodeFromNumber(18)).toBe('proxima_50');
    });

    it('особые поставки получают фиксированные коды', () => {
        expect(supplyCodeFromNumber(0)).toBe('internet_std');
        expect(supplyCodeFromNumber(9)).toBe('proxima_local');
        expect(supplyCodeFromNumber(10)).toBe('proxima_flash');
    });

    it('номер 9 — проксима (Локальная), а не девятая интернет-поставка', () => {
        expect(SUPPLY_NUMBER_TO_KEY[9].type).toBe('proxima');
    });

    it('неизвестный номер поставки даёт null', () => {
        expect(supplyCodeFromNumber(99)).toBeNull();
    });

    it('универсальные номера входят в карту комплектов', () => {
        for (const number of UNIVERSAL_COMPLECT_NUMBERS) {
            expect(COMPLECT_NUMBER_TO_CODE[number]).toBeDefined();
        }
    });

    it('LT-линейка маппится на коды пакетов', () => {
        expect(LT_PACKAGE_NUMBER_TO_CODE[13]).toBe('ltpackSmall');
        expect(LT_PACKAGE_NUMBER_TO_CODE[14]).toBe('ltpackMedium');
        expect(LT_PACKAGE_NUMBER_TO_CODE[15]).toBe('ltpackBig');
        expect(LT_PACKAGE_NUMBER_TO_CODE[1020]).toBeUndefined();
    });
});
