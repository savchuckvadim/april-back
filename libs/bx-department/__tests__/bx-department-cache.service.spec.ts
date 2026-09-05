import { RedisService } from 'src/core/redis/redis.service';
import { BxDepartmentCacheService } from '../services/bx-department-cache.service';

const DOMAIN = 'example.bitrix24.ru';

describe('BxDepartmentCacheService', () => {
    let scan: jest.Mock;
    let del: jest.Mock;
    let service: BxDepartmentCacheService;

    beforeEach(() => {
        scan = jest.fn().mockResolvedValue(['0', []]);
        del = jest.fn((...keys: string[]) => Promise.resolve(keys.length));

        const redisService = {
            getClient: () => ({ scan, del }),
        } as unknown as RedisService;

        service = new BxDepartmentCacheService(redisService);
    });

    it('для домена строит паттерны всех трёх префиксов кэша', async () => {
        const result = await service.reset(DOMAIN);

        expect(result.patterns).toEqual([
            `department_structure_v3_${DOMAIN}_*`,
            `department_${DOMAIN}_*`,
            `bx_team_${DOMAIN}_*`,
        ]);
        expect(scan).toHaveBeenCalledWith(
            '0',
            'MATCH',
            `department_structure_v3_${DOMAIN}_*`,
            'COUNT',
            expect.any(Number),
        );
    });

    it('без домена сбрасывает по всем порталам (wildcard)', async () => {
        const result = await service.reset();

        expect(result.patterns).toEqual([
            'department_structure_v3_*_*',
            'department_*_*',
            'bx_team_*_*',
        ]);
    });

    it('удаляет найденные ключи и возвращает их количество', async () => {
        scan.mockImplementation((_c: string, _m: string, pattern: string) => {
            if (pattern.startsWith('bx_team_')) {
                return Promise.resolve(['0', [`bx_team_${DOMAIN}_0724_sales`]]);
            }
            if (pattern.startsWith('department_structure_v3_')) {
                return Promise.resolve([
                    '0',
                    [`department_structure_v3_${DOMAIN}_0724_sales_single`],
                ]);
            }
            return Promise.resolve(['0', [`department_${DOMAIN}_0724_sales`]]);
        });

        const result = await service.reset(DOMAIN);

        expect(result.deletedCount).toBe(3);
        expect(del).toHaveBeenCalledWith(
            `department_structure_v3_${DOMAIN}_0724_sales_single`,
            `department_${DOMAIN}_0724_sales`,
            `bx_team_${DOMAIN}_0724_sales`,
        );
    });

    it('дедуплицирует ключи с пересекающихся паттернов (department_* накрывает structure)', async () => {
        const structureKey = 'department_structure_v3_a_0724_sales_single';
        scan.mockImplementation((_c: string, _m: string, pattern: string) => {
            if (pattern.startsWith('bx_team_')) {
                return Promise.resolve(['0', []]);
            }
            // и department_*_*, и department_structure_v3_*_* находят один ключ
            return Promise.resolve(['0', [structureKey]]);
        });

        const result = await service.reset();

        expect(result.deletedCount).toBe(1);
        expect(del).toHaveBeenCalledTimes(1);
        expect(del).toHaveBeenCalledWith(structureKey);
    });

    it('проходит по курсору SCAN до конца', async () => {
        scan.mockImplementation(
            (cursor: string, _m: string, pattern: string) => {
                if (!pattern.startsWith('bx_team_')) {
                    return Promise.resolve(['0', []]);
                }
                return cursor === '0'
                    ? Promise.resolve(['42', ['bx_team_a_0724_sales']])
                    : Promise.resolve(['0', ['bx_team_b_0724_sales']]);
            },
        );

        const result = await service.reset();

        expect(result.deletedCount).toBe(2);
        expect(scan).toHaveBeenCalledWith(
            '42',
            'MATCH',
            'bx_team_*_*',
            'COUNT',
            expect.any(Number),
        );
    });

    it('при пустом результате не вызывает del', async () => {
        const result = await service.reset(DOMAIN);

        expect(result.deletedCount).toBe(0);
        expect(del).not.toHaveBeenCalled();
    });

    it('удаляет большие наборы ключей чанками', async () => {
        const keys = Array.from({ length: 600 }, (_, i) => `bx_team_k${i}_x_y`);
        scan.mockImplementation((_c: string, _m: string, pattern: string) =>
            Promise.resolve(['0', pattern.startsWith('bx_team_') ? keys : []]),
        );

        const result = await service.reset();

        expect(result.deletedCount).toBe(600);
        expect(del).toHaveBeenCalledTimes(2);
    });
});
