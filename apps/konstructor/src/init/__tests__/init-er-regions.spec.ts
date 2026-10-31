import { InitComplectService } from '../services/init-complect.service';
import { InitRegionService } from '../services/init.region.service';

/**
 * Init: состав ЭР комплекта и портальные регионы. Пакет ЭР лежит в группе с
 * type = er, поэтому фильтр только по типу тащил его в отдельные ЭР, и вес
 * пакета считался дважды.
 */
const block = (
    code: string,
    number: number,
    group: { code: string; type: string },
    packageInfoblocks?: unknown[],
) => ({
    code,
    number,
    name: code,
    isFree: false,
    group: { ...group, productType: 'garant' },
    packageInfoblocks,
});

const ER = { code: 'er', type: 'er' };
const PER = { code: 'per', type: 'er' };

const complectWith = (infoblocks: unknown[]) => ({
    id: '1',
    code: 'office',
    name: 'Офис',
    type: 'prof',
    infoblocks,
});

const initComplect = async (infoblocks: unknown[]) => {
    const service = new InitComplectService(
        { findAll: async () => [complectWith(infoblocks)] } as never,
        {} as never,
    );
    return (await service.get())!.prof[0].codes;
};

describe('init: ЭР комплекта', () => {
    const erprov = block('erprov', 0, ER);
    const ertax = block('ertax', 5, ER);
    const ercorp = block('ercorp', 7, ER);

    it('пакет не попадает в отдельные ЭР', async () => {
        const codes = await initComplect([
            block('perbuh', 0, PER, [erprov, ertax]),
            ercorp,
        ]);
        expect(codes.ers).toEqual(['ercorp']);
        expect(codes.packetsEr).toEqual(['perbuh']);
        expect(codes.ersInPacket).toEqual(['erprov', 'ertax']);
    });

    it('ЭР из двух пакетов (Офис) считается один раз', async () => {
        const codes = await initComplect([
            block('perbuh', 0, PER, [erprov, ertax]),
            block('perur', 2, PER, [erprov, ercorp]),
        ]);
        expect(codes.packetsEr).toEqual(['perbuh', 'perur']);
        expect(codes.ersInPacket).toEqual(['erprov', 'ertax', 'ercorp']);
    });
});

describe('init: регионы', () => {
    const region = (code: string, abs: number) => ({ code, abs });

    const initRegions = (all: unknown[], portal: unknown[]) =>
        new InitRegionService({
            findAll: async () => all,
            findByPortalId: async () => portal,
        } as never).get(1);

    it('весь справочник; привязанные — с признаком и ставкой портала', async () => {
        const regions = await initRegions(
            [region('msk', 100), region('rstv', 200)],
            [region('rstv', 250)],
        );
        expect(regions).toEqual([
            { code: 'msk', abs: 100, inPortal: false },
            { code: 'rstv', abs: 250, inPortal: true },
        ]);
    });

    it('портал без привязок: весь справочник без признака', async () => {
        const regions = await initRegions([region('msk', 100)], []);
        expect(regions).toEqual([{ code: 'msk', abs: 100, inPortal: false }]);
    });
});
