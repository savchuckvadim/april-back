import { Logger } from '@nestjs/common';
import { RabsVatService } from '../rabs-vat.service';
import { roundToCents, withRabsVat } from '../lib/rabs-vat.util';
import { resolvePortalPrice } from '../lib/portal-price.util';

/** Читатель настроек вендора: значение настройки или сбой чтения. */
const readerOf = (value: string | null | Error) => ({
    get: jest.fn(() =>
        value instanceof Error ? Promise.reject(value) : Promise.resolve(value),
    ),
    getMany: jest.fn(),
});

const serviceOf = (value: string | null | Error) => {
    const reader = readerOf(value);
    const service = new RabsVatService(
        { get: () => undefined } as never,
        reader,
    );
    return { service, reader };
};

describe('RabsVatService', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('не задан ни в админке, ни в env — 1.22', async () => {
        expect(await serviceOf(null).service.coefficient()).toBe(1.22);
        expect(warn).not.toHaveBeenCalled();
    });

    it('значение из настроек вендора', async () => {
        expect(await serviceOf('1.2').service.coefficient()).toBe(1.2);
        expect(await serviceOf('1,25').service.coefficient()).toBe(1.25);
    });

    it('смена настройки меняет коэффициент при следующем чтении', async () => {
        const reader = readerOf('1.2');
        const service = new RabsVatService(
            { get: () => undefined } as never,
            reader,
        );
        expect(await service.coefficient()).toBe(1.2);
        reader.get.mockResolvedValue('1.25');
        expect(await service.coefficient()).toBe(1.25);
    });

    it('неверное значение — 1.22 и предупреждение в лог, повтор того же значения лог не засоряет', async () => {
        for (const bad of ['1', '0.5', '22', 'abc']) {
            warn.mockClear();
            const { service } = serviceOf(bad);
            expect(await service.coefficient()).toBe(1.22);
            expect(await service.coefficient()).toBe(1.22);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain(`«${bad}»`);
        }
    });

    it('сбой чтения настроек не роняет расчёт: 1.22 и предупреждение', async () => {
        const { service } = serviceOf(new Error('БД недоступна'));
        expect(await service.coefficient()).toBe(1.22);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('без читателя настроек действует env с тем же именем', async () => {
        const env: Record<string, string> = {
            KONSTRUKTOR_RABS_VAT_COEFFICIENT: '1.2',
        };
        const service = new RabsVatService({
            get: (key: string) => env[key],
        } as never);
        expect(await service.coefficient()).toBe(1.2);
    });
});

describe('roundToCents', () => {
    it('округляет до копеек и не поддаётся шуму плавающей точки', () => {
        expect(roundToCents(5096.184)).toBe(5096.18);
        expect(roundToCents(1.005)).toBe(1.01);
        expect(roundToCents(3000 * 1.22)).toBe(3660);
    });
});

describe('withRabsVat', () => {
    it('tax равен коэффициенту, tax_abs равен abs × K, abs остаётся без НДС', () => {
        const price = withRabsVat(
            { abs: 3000, tax: 1.2, tax_abs: 3600, code: 'ud' },
            1.22,
        );
        expect(price).toEqual({
            abs: 3000,
            tax: 1.22,
            tax_abs: 3660,
            code: 'ud',
        });
    });

    it('хранимые tax и tax_abs игнорируются', () => {
        const stale = { abs: 4177.2, tax: 7, tax_abs: 1 };
        expect(withRabsVat(stale, 1.22)).toEqual({
            abs: 4177.2,
            tax: 1.22,
            tax_abs: 5096.18,
        });
    });

    it('после слияния рабса портала: источник, ручной рабс и общий считаются от своего abs', () => {
        const region = { abs: 3000, tax: 1.2, tax_abs: 3600 };
        const source = { abs: 4177.2, tax: 1.2, tax_abs: 5012.64 };
        const merged = (override: Parameters<typeof resolvePortalPrice>[1]) =>
            withRabsVat(resolvePortalPrice(region, override), 1.22);

        expect(merged(null)).toEqual({ abs: 3000, tax: 1.22, tax_abs: 3660 });
        expect(
            merged({
                ownAbs: 5000,
                ownTax: 1.2,
                ownTaxAbs: 6000,
                ownAbsRegion: null,
            }),
        ).toEqual({ abs: 5000, tax: 1.22, tax_abs: 6100 });
        expect(
            merged({
                ownAbs: null,
                ownTax: null,
                ownTaxAbs: null,
                ownAbsRegion: source,
            }),
        ).toEqual({ abs: 4177.2, tax: 1.22, tax_abs: 5096.18 });
    });
});
