import { resolvePortalPrice } from '../lib/portal-price.util';

const region = { abs: 3000, tax: 1.2, tax_abs: 3600 };
const leningrad = { abs: 4177.2, tax: 1.2, tax_abs: 5012.64 };

describe('resolvePortalPrice', () => {
    it('без своих настроек отдаёт общий рабс региона', () => {
        expect(resolvePortalPrice(region, null)).toEqual(region);
        expect(resolvePortalPrice(region)).toEqual(region);
    });

    it('регион-источник подменяет все три цены целиком', () => {
        const price = resolvePortalPrice(region, {
            ownAbs: 1,
            ownTax: 1,
            ownTaxAbs: 1,
            ownAbsRegion: leningrad,
        });
        expect(price).toEqual(leningrad);
    });

    it('ручной рабс подставляется по полям, незаданные остаются общими', () => {
        const price = resolvePortalPrice(region, {
            ownAbs: 5000,
            ownTax: null,
            ownTaxAbs: null,
            ownAbsRegion: null,
        });
        expect(price).toEqual({ abs: 5000, tax: 1.2, tax_abs: 3600 });
    });

    it('нули в own-полях считаются «не задано»', () => {
        const price = resolvePortalPrice(region, {
            ownAbs: 0,
            ownTax: 0,
            ownTaxAbs: 0,
            ownAbsRegion: null,
        });
        expect(price).toEqual(region);
    });

    it('результат не ссылается на исходный объект региона', () => {
        const price = resolvePortalPrice(region, null);
        expect(price).not.toBe(region);
    });
});
