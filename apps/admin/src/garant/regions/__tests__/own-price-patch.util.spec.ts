import { buildOwnPricePatch } from '../lib/own-price-patch.util';

const known = new Set([12, 47, 60]);

describe('buildOwnPricePatch', () => {
    it('ручной рабс: own_tax 1.20, own_tax_abs считается, источник сбрасывается', () => {
        const result = buildOwnPricePatch(
            12,
            { ownAbs: '5000', ownAbsRegionId: null },
            known,
        );
        expect(result).toEqual({
            ok: true,
            patch: {
                own_abs: '5000.00',
                own_tax: '1.20',
                own_tax_abs: '6000.00',
                own_abs_region_id: null,
            },
        });
    });

    it('регион-источник: ссылка ставится, ручные поля сбрасываются', () => {
        const result = buildOwnPricePatch(
            12,
            { ownAbs: null, ownAbsRegionId: 47 },
            known,
        );
        expect(result).toEqual({
            ok: true,
            patch: {
                own_abs: null,
                own_tax: null,
                own_tax_abs: null,
                own_abs_region_id: 47,
            },
        });
    });

    it('оба null — возврат к общему рабсу региона', () => {
        const result = buildOwnPricePatch(
            12,
            { ownAbs: null, ownAbsRegionId: null },
            known,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.patch.own_abs).toBeNull();
            expect(result.patch.own_abs_region_id).toBeNull();
        }
    });

    it('рабс и источник одновременно — отказ', () => {
        const result = buildOwnPricePatch(
            12,
            { ownAbs: '5000', ownAbsRegionId: 47 },
            known,
        );
        expect(result).toEqual({
            ok: false,
            reason: 'укажите либо свой рабс, либо регион-источник',
        });
    });

    it('регион не может ссылаться сам на себя', () => {
        const result = buildOwnPricePatch(
            12,
            { ownAbs: null, ownAbsRegionId: 12 },
            known,
        );
        expect(result.ok).toBe(false);
    });

    it('неизвестный источник — отказ', () => {
        const result = buildOwnPricePatch(
            12,
            { ownAbs: null, ownAbsRegionId: 999 },
            known,
        );
        expect(result).toEqual({
            ok: false,
            reason: 'регион-источник не найден',
        });
    });

    it('нулевой или отрицательный рабс — отказ', () => {
        expect(
            buildOwnPricePatch(12, { ownAbs: '0', ownAbsRegionId: null }, known)
                .ok,
        ).toBe(false);
        expect(
            buildOwnPricePatch(
                12,
                { ownAbs: '-5', ownAbsRegionId: null },
                known,
            ).ok,
        ).toBe(false);
    });
});
