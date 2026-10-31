import { InitComplectService } from '../services/init-complect.service';
import { InitServicesService } from '../services/init-services.service';

/**
 * Init: сервисы LT лежат инфоблоками группы `lt`, а умолчания комплекта — в его
 * связях с инфоблоками. Раньше список читался из complects (там LT нет), а
 * умолчания не отдавались вовсе: на живых данных LT не работал.
 */
const block = (
    code: string,
    number: number,
    group: { code: string; type: string },
    weight = '1',
) => ({
    id: String(number),
    code,
    number,
    name: `Блок ${code}`,
    title: null,
    weight,
    isFree: group.type === 'free',
    group: { ...group, productType: group.type },
});

const LT = { code: 'lt', type: 'lt' };
const FREE = { code: 'freeBlocks', type: 'free' };
const STAR = { code: 'star', type: 'star' };

describe('init: умолчания комплекта', () => {
    const codesOf = async (infoblocks: unknown[]) => {
        const service = new InitComplectService(
            {
                findAll: async () => [
                    { id: '1', code: 'buh', name: 'Бухгалтер', type: 'prof', infoblocks },
                ],
            } as never,
            {} as never,
        );
        return (await service.get())!.prof[0].codes;
    };

    it('LT, бесплатные блоки и СТАР идут отдельно от наполнения', async () => {
        const codes = await codesOf([
            block('ltsemi', 50, LT),
            block('ltconstructor', 51, LT),
            block('praim', 40, FREE),
            block('starpack', 70, STAR),
        ]);
        expect(codes.lt).toEqual(['ltsemi', 'ltconstructor']);
        expect(codes.freeBlocks).toEqual(['praim']);
        expect(codes.star).toEqual(['starpack']);
        expect(codes.filling).toEqual([]);
    });

    it('порядок сервисов — по каталогу, а не по порядку связей', async () => {
        const codes = await codesOf([block('ltconstructor', 51, LT), block('ltsemi', 50, LT)]);
        expect(codes.lt).toEqual(['ltsemi', 'ltconstructor']);
    });

    it('у комплекта без LT — пустой список', async () => {
        const codes = await codesOf([block('praim', 40, FREE)]);
        expect(codes.lt).toEqual([]);
        expect(codes.star).toEqual([]);
    });
});

describe('init: сервисы LT', () => {
    const servicesOf = async (groups: unknown[]) => {
        const service = new InitServicesService(
            { findAll: async () => [] } as never,
            { findAll: async () => [] } as never,
            { findMany: async () => groups } as never,
        );
        return (await service.get()).lt;
    };

    it('берутся из группы `lt` с весом числом', async () => {
        const lt = await servicesOf([
            { type: 'lt', infoblocks: [block('iscra', 1000, LT, '2'), block('ltsemi', 50, LT)] },
            { type: 'free', infoblocks: [block('praim', 40, FREE)] },
        ]);
        expect(lt.map(item => [item.code, item.weight])).toEqual([
            ['ltsemi', 1],
            ['iscra', 2],
        ]);
        expect(lt[0]).toMatchObject({
            productType: 'lt',
            isPackage: false,
            fullName: 'Блок ltsemi',
        });
    });
});
