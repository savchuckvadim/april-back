import { RabsVatService } from '@lib/garant/region/rabs-vat.service';
import { RegionPrismaRepository } from '@lib/garant/region/region.prisma.repository';
import { RegionService } from '@lib/garant/region/region.service';
import { KonstructorInitUseCase } from '../konstructor-init.use-case';
import { regionWeight } from '../lib/region-weight.util';
import { InitRegionService } from '../services/init.region.service';

/**
 * Init: регионы с НДС рабса на лету. abs отдаётся без НДС, tax равен
 * коэффициенту из настроек вендора, tax_abs равен действующему abs × K.
 * Хранимые tax / tax_abs / own_tax / own_tax_abs в выдаче не участвуют.
 * Слияние рабса портала идёт настоящим репозиторием на подставной базе.
 */

interface RegionRow {
    id: bigint;
    number: number;
    title: string;
    code: string;
    infoblock: string;
    abs: number;
    tax: number;
    tax_abs: number;
    created_at: null;
    updated_at: null;
}

/** Регион справочника; tax и tax_abs записаны при прежнем коэффициенте 1.2 */
const regionRow = (id: number, code: string, abs: number): RegionRow => ({
    id: BigInt(id),
    number: id,
    title: code,
    code,
    infoblock: code,
    abs,
    tax: 1.2,
    tax_abs: Math.round(abs * 1.2 * 100) / 100,
    created_at: null,
    updated_at: null,
});

const MSK = regionRow(1, 'msk', 4000);
const EKB = regionRow(2, 'ekb', 3000); // общий рабс, к порталу не привязан
const NSK = regionRow(3, 'nsk', 2000); // у портала свой ручной рабс
const KZN = regionRow(4, 'kzn', 2500); // у портала рабс региона-источника
const SPB = regionRow(5, 'spb', 4177.2); // источник для kzn

/** Связи портала: ручной рабс у nsk, источник spb у kzn, msk без своего рабса */
const PORTAL_LINKS = [
    {
        portal_id: 1,
        region_id: NSK.id,
        own_abs: 5000,
        own_tax: 1.2,
        own_tax_abs: 6000,
        region: NSK,
        own_abs_region: null,
    },
    {
        portal_id: 1,
        region_id: KZN.id,
        own_abs: null,
        own_tax: null,
        own_tax_abs: null,
        region: KZN,
        own_abs_region: SPB,
    },
    {
        portal_id: 1,
        region_id: MSK.id,
        own_abs: null,
        own_tax: null,
        own_tax_abs: null,
        region: MSK,
        own_abs_region: null,
    },
];

/** Настройка вендора «коэффициент НДС рабса»: значение можно менять по ходу теста */
const makeSettings = (initial: string | null) => {
    const state = { value: initial };
    const reader = {
        get: jest.fn(() => Promise.resolve(state.value)),
        getMany: jest.fn(),
    };
    return { state, reader };
};

const makeRegions = (initialVat: string | null) => {
    const { state, reader } = makeSettings(initialVat);
    const prisma = {
        regions: {
            findMany: jest.fn().mockResolvedValue([MSK, EKB, NSK, KZN, SPB]),
        },
        portal_region: { findMany: jest.fn().mockResolvedValue(PORTAL_LINKS) },
    };
    const regionService = new RegionService(
        new RegionPrismaRepository(prisma as never),
    );
    const rabsVat = new RabsVatService(
        { get: () => undefined } as never,
        reader,
    );
    const service = new InitRegionService(regionService, rabsVat);
    return { service, state };
};

const byCode = async (
    service: InitRegionService,
): Promise<Record<string, { abs: number; tax: number; tax_abs: number }>> => {
    const regions = await service.get(1);
    return Object.fromEntries(
        regions.map(region => [
            region.code,
            { abs: region.abs, tax: region.tax, tax_abs: region.tax_abs },
        ]),
    );
};

describe('init: НДС рабса на лету', () => {
    it('общий регион: tax_abs = abs × K, хранимые 1.2 не используются', async () => {
        const { service } = makeRegions('1.22');
        const regions = await byCode(service);
        expect(regions.ekb).toEqual({ abs: 3000, tax: 1.22, tax_abs: 3660 });
    });

    it('без настройки действует 1.22', async () => {
        const { service } = makeRegions(null);
        const regions = await byCode(service);
        expect(regions.ekb).toEqual({ abs: 3000, tax: 1.22, tax_abs: 3660 });
    });

    it('свой ручной рабс портала: tax_abs = ручной abs × K, записанный own_tax_abs не участвует', async () => {
        const { service } = makeRegions('1.22');
        const regions = await byCode(service);
        expect(regions.nsk).toEqual({ abs: 5000, tax: 1.22, tax_abs: 6100 });
    });

    it('регион-источник: tax_abs = abs источника × K', async () => {
        const { service } = makeRegions('1.22');
        const regions = await byCode(service);
        expect(regions.kzn).toEqual({
            abs: 4177.2,
            tax: 1.22,
            tax_abs: 5096.18,
        });
    });

    it('смена коэффициента меняет tax и tax_abs у всех трёх видов рабса', async () => {
        const { service, state } = makeRegions('1.22');
        state.value = '1.3';
        const regions = await byCode(service);
        expect(regions.ekb).toEqual({ abs: 3000, tax: 1.3, tax_abs: 3900 });
        expect(regions.nsk).toEqual({ abs: 5000, tax: 1.3, tax_abs: 6500 });
        expect(regions.kzn).toEqual({
            abs: 4177.2,
            tax: 1.3,
            tax_abs: 5430.36,
        });
    });

    it('неверный коэффициент (не больше 1, не число, процент) — 1.22', async () => {
        for (const bad of ['1', '0.7', 'abc', '22']) {
            const { service } = makeRegions(bad);
            const regions = await byCode(service);
            expect(regions.ekb).toEqual({
                abs: 3000,
                tax: 1.22,
                tax_abs: 3660,
            });
        }
    });
});

describe('вес региона', () => {
    it('regionWeight: Москва 1, остальные 0.5', () => {
        expect(regionWeight('msk')).toBe(1);
        expect(regionWeight('spb')).toBe(0.5);
        expect(regionWeight('ekb')).toBe(0.5);
        expect(regionWeight('')).toBe(0.5);
    });

    it('init отдаёт вес по коду региона и цены с НДС на лету', async () => {
        const { service } = makeRegions('1.22');
        const useCase = new KonstructorInitUseCase(
            { get: async () => null } as never,
            { get: async () => [] } as never,
            service,
            { findByPortalId: async () => [] } as never,
            {
                getPortalByDomain: async () => ({ id: BigInt(1) }),
            } as never,
            { findMany: async () => [] } as never,
            { findMany: async () => [] } as never,
            { get: async () => ({}) } as never,
            { findMany: async () => [] } as never,
            { findByPortalId: async () => [] } as never,
            { findAll: async () => [] } as never,
        );

        const { regions } = await useCase.init('portal.bitrix24.ru');
        const view = Object.fromEntries(
            regions.map(region => [
                region.code,
                [region.weight, region.abs, region.tax, region.tax_abs],
            ]),
        );

        expect(view).toEqual({
            msk: [1, 4000, 1.22, 4880],
            ekb: [0.5, 3000, 1.22, 3660],
            nsk: [0.5, 5000, 1.22, 6100],
            kzn: [0.5, 4177.2, 1.22, 5096.18],
            spb: [0.5, 4177.2, 1.22, 5096.18],
        });
    });
});
