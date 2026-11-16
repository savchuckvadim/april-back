import { KonstructorInitUseCase } from '../konstructor-init.use-case';
import { InitComplectService } from '../services/init-complect.service';
import { InitServicesService } from '../services/init-services.service';

/**
 * Init: разделы каталога читаются одновременно, а комплекты — один раз на
 * запрос. Раньше девять запросов шли подряд, и самый тяжёлый (комплекты со
 * связями) выполнялся дважды: для самих комплектов и для блока сервисов.
 */

/** Отложенный ответ: тест сам решает, когда «база» ответит */
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const complectEntity = {
    id: '1',
    code: 'buh',
    name: 'Бухгалтер',
    type: 'prof',
    infoblocks: [],
};

const createUseCase = () => {
    const complectService = { findAll: jest.fn() };
    const packageService = { findAll: jest.fn().mockResolvedValue([]) };
    const infogroupService = {
        findMany: jest.fn().mockResolvedValue([]),
        findManyWithPackages: jest.fn().mockResolvedValue([]),
    };
    const stages = {
        infoblock: { get: jest.fn().mockResolvedValue([]) },
        region: { get: jest.fn().mockResolvedValue([]) },
        contract: { findByPortalId: jest.fn().mockResolvedValue([]) },
        supply: { findMany: jest.fn().mockResolvedValue([]) },
        price: { findMany: jest.fn().mockResolvedValue([]) },
        measure: { findMany: jest.fn().mockResolvedValue([]) },
        portalMeasure: { findByPortalId: jest.fn().mockResolvedValue([]) },
    };
    const useCase = new KonstructorInitUseCase(
        // настоящие сервисы комплектов и сервисов: проверяем, что список к ним приходит готовым
        new InitComplectService(complectService as never, {} as never),
        stages.infoblock as never,
        stages.region as never,
        stages.contract as never,
        {
            getPortalByDomain: jest.fn().mockResolvedValue({ id: BigInt(3) }),
        } as never,
        stages.supply as never,
        stages.price as never,
        new InitServicesService(
            complectService as never,
            packageService as never,
            infogroupService as never,
        ),
        stages.measure as never,
        stages.portalMeasure as never,
        complectService as never,
    );
    return { useCase, complectService, stages };
};

describe('init: сборка каталога', () => {
    it('комплекты читаются один раз на запрос', async () => {
        const { useCase, complectService } = createUseCase();
        complectService.findAll.mockResolvedValue([complectEntity]);

        const result = await useCase.init('portal.bitrix24.ru');

        expect(complectService.findAll).toHaveBeenCalledTimes(1);
        // в ответе код комплекта лежит в поле name
        expect(result.complects.prof.map(complect => complect.name)).toEqual([
            'buh',
        ]);
        expect(result.services).toEqual({
            lt: [],
            ltPackages: [],
            consalting: [],
            star: [],
        });
    });

    it('разделы не ждут друг друга: пока комплекты в пути, остальное уже запрошено', async () => {
        const { useCase, complectService, stages } = createUseCase();
        const complects = deferred<(typeof complectEntity)[]>();
        complectService.findAll.mockReturnValue(complects.promise);

        const running = useCase.init('portal.bitrix24.ru');
        await flush();

        expect(stages.infoblock.get).toHaveBeenCalledTimes(1);
        expect(stages.region.get).toHaveBeenCalledWith(3);
        expect(stages.contract.findByPortalId).toHaveBeenCalledWith(3);
        expect(stages.supply.findMany).toHaveBeenCalledTimes(1);
        expect(stages.price.findMany).toHaveBeenCalledTimes(1);
        expect(stages.measure.findMany).toHaveBeenCalledTimes(1);

        complects.resolve([complectEntity]);
        await expect(running).resolves.toMatchObject({
            complects: { prof: [{ name: 'buh' }], universal: [] },
        });
    });

    it('сбой одного раздела отдаёт ошибку наверх', async () => {
        const { useCase, complectService, stages } = createUseCase();
        complectService.findAll.mockResolvedValue([complectEntity]);
        stages.price.findMany.mockRejectedValue(new Error('база недоступна'));

        await expect(useCase.init('portal.bitrix24.ru')).rejects.toThrow(
            'база недоступна',
        );
    });

    it('сервисы без готового списка читают комплекты сами — как раньше', async () => {
        const complectService = {
            findAll: jest.fn().mockResolvedValue([complectEntity]),
        };
        const service = new InitComplectService(
            complectService as never,
            {} as never,
        );

        const result = await service.get();

        expect(complectService.findAll).toHaveBeenCalledTimes(1);
        expect(result?.prof).toHaveLength(1);
    });
});
