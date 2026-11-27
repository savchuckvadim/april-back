import { GetPortalRegionResponseDto } from '../dto/request/get-portal-region-response.dto';

/**
 * Админка: effective_tax и effective_tax_abs считаются на лету от
 * коэффициента НДС рабса (настройка вендора); значения из базы в них не участвуют.
 */

/** Общий регион справочника; tax и tax_abs записаны при прежнем коэффициенте 1.2 */
const region = {
    id: '2',
    number: 2,
    title: 'Екатеринбург',
    code: 'ekb',
    infoblock: 'ekb',
    abs: 3000,
    tax: 1.2,
    tax_abs: 3600,
};

const spb = {
    id: '5',
    number: 5,
    title: 'Санкт-Петербург',
    code: 'spb',
    infoblock: 'spb',
    abs: 4177.2,
    tax: 1.2,
    tax_abs: 5012.64,
};

const link = (override: {
    ownAbs?: number | null;
    ownAbsRegion?: typeof spb | null;
}) => ({
    portalId: 1,
    regionId: 2,
    ownAbs: override.ownAbs ?? null,
    ownTax: 1.2,
    ownTaxAbs: 9999,
    ownAbsRegion: override.ownAbsRegion ?? null,
});

describe('GetPortalRegionResponseDto: effective_* по коэффициенту НДС рабса', () => {
    it('общий рабс: effective_tax_abs = abs × K', () => {
        const dto = new GetPortalRegionResponseDto(region, null, 1.22);
        expect(dto.effective_abs).toBe(3000);
        expect(dto.effective_tax).toBe(1.22);
        expect(dto.effective_tax_abs).toBe(3660);
    });

    it('ручной рабс портала: от ручного abs, записанный own_tax_abs не используется', () => {
        const dto = new GetPortalRegionResponseDto(
            region,
            link({ ownAbs: 5000 }),
            1.22,
        );
        expect(dto.effective_abs).toBe(5000);
        expect(dto.effective_tax_abs).toBe(6100);
    });

    it('регион-источник: от abs источника', () => {
        const dto = new GetPortalRegionResponseDto(
            region,
            link({ ownAbsRegion: spb }),
            1.22,
        );
        expect(dto.effective_abs).toBe(4177.2);
        expect(dto.effective_tax_abs).toBe(5096.18);
    });

    it('смена коэффициента меняет effective_tax и effective_tax_abs', () => {
        const dto = new GetPortalRegionResponseDto(region, null, 1.3);
        expect(dto.effective_tax).toBe(1.3);
        expect(dto.effective_tax_abs).toBe(3900);
    });
});
