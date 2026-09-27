import { Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { BxSuperUserService } from '../services/bx-super-user.service';
import {
    VendorSuperUserRecord,
    VendorSuperUserRepository,
} from '../repositories/vendor-super-user.repository';

/** Redis-заглушка с живой картой ключей — проверяем и запись, и сброс. */
const makeRedis = () => {
    const store = new Map<string, string>();
    const get = jest.fn((key: string) =>
        Promise.resolve(store.get(key) ?? null),
    );
    const set = jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
    });
    const del = jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve(1);
    });
    const service = {
        getClient: () => ({ get, set, del }),
    } as unknown as RedisService;
    return { service, get, set, del, store };
};

/** Redis, который всегда падает — проверяем, что это не роняет проверку. */
const makeBrokenRedis = () => {
    const fail = () => Promise.reject(new Error('redis down'));
    return {
        getClient: () => ({ get: fail, set: fail, del: fail }),
    } as unknown as RedisService;
};

const makeRepository = (ids: number[]) => {
    const findActiveBitrixIdsByDomain = jest.fn(() => Promise.resolve(ids));
    const repository = {
        findActiveBitrixIdsByDomain,
        findByPortalId: jest.fn(() =>
            Promise.resolve([] as VendorSuperUserRecord[]),
        ),
        upsert: jest.fn(),
        remove: jest.fn(),
    } as unknown as VendorSuperUserRepository;
    return { repository, findActiveBitrixIdsByDomain };
};

describe('BxSuperUserService', () => {
    it('узнаёт суперпользователя портала по записям БД', async () => {
        const { repository } = makeRepository([123, 456]);
        const service = new BxSuperUserService(repository, makeRedis().service);

        await expect(
            service.isSuperUser('example.bitrix24.ru', 123),
        ).resolves.toBe(true);
        await expect(
            service.isSuperUser('example.bitrix24.ru', 999),
        ).resolves.toBe(false);
    });

    it('сравнивает домен без учёта регистра и пробелов по краям', async () => {
        const { repository, findActiveBitrixIdsByDomain } = makeRepository([7]);
        const service = new BxSuperUserService(repository, makeRedis().service);

        await expect(
            service.isSuperUser('  Example.Bitrix24.RU  ', 7),
        ).resolves.toBe(true);
        expect(findActiveBitrixIdsByDomain).toHaveBeenCalledWith(
            'example.bitrix24.ru',
        );
    });

    it('не ходит в БД для нечисловых и неположительных id', async () => {
        const { repository, findActiveBitrixIdsByDomain } = makeRepository([1]);
        const service = new BxSuperUserService(repository, makeRedis().service);

        await expect(service.isSuperUser('example.ru', 0)).resolves.toBe(false);
        await expect(service.isSuperUser('example.ru', -5)).resolves.toBe(false);
        await expect(service.isSuperUser('example.ru', 1.5)).resolves.toBe(
            false,
        );
        expect(findActiveBitrixIdsByDomain).not.toHaveBeenCalled();
    });

    it('пустой домен — не суперпользователь, без запроса в БД', async () => {
        const { repository, findActiveBitrixIdsByDomain } = makeRepository([1]);
        const service = new BxSuperUserService(repository, makeRedis().service);

        await expect(service.isSuperUser('   ', 1)).resolves.toBe(false);
        expect(findActiveBitrixIdsByDomain).not.toHaveBeenCalled();
    });

    it('второй вызов берёт список из кэша, а не из БД', async () => {
        const { repository, findActiveBitrixIdsByDomain } = makeRepository([42]);
        const redis = makeRedis();
        const service = new BxSuperUserService(repository, redis.service);

        await service.isSuperUser('example.ru', 42);
        await service.isSuperUser('example.ru', 42);

        expect(findActiveBitrixIdsByDomain).toHaveBeenCalledTimes(1);
        expect(redis.set).toHaveBeenCalledTimes(1);
    });

    it('invalidate убирает ключ, следующий вызов снова читает БД', async () => {
        const { repository, findActiveBitrixIdsByDomain } = makeRepository([42]);
        const redis = makeRedis();
        const service = new BxSuperUserService(repository, redis.service);

        await service.isSuperUser('example.ru', 42);
        await service.invalidate('Example.RU');
        await service.isSuperUser('example.ru', 42);

        expect(redis.del).toHaveBeenCalledWith('vendor-super-users:example.ru');
        expect(findActiveBitrixIdsByDomain).toHaveBeenCalledTimes(2);
    });

    it('мусор в кэше не ломает проверку — читает БД', async () => {
        const { repository, findActiveBitrixIdsByDomain } = makeRepository([5]);
        const redis = makeRedis();
        redis.store.set('vendor-super-users:example.ru', 'не json');
        const service = new BxSuperUserService(repository, redis.service);

        await expect(service.isSuperUser('example.ru', 5)).resolves.toBe(true);
        expect(findActiveBitrixIdsByDomain).toHaveBeenCalled();
    });

    it('сбой Redis не роняет проверку — читает БД напрямую', async () => {
        const { repository } = makeRepository([8]);
        const service = new BxSuperUserService(repository, makeBrokenRedis());

        await expect(service.isSuperUser('example.ru', 8)).resolves.toBe(true);
    });

    it('сбой БД — отказ в безопасную сторону, с логом ошибки', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const repository = {
            findActiveBitrixIdsByDomain: jest.fn(() =>
                Promise.reject(new Error('db down')),
            ),
        } as unknown as VendorSuperUserRepository;
        const service = new BxSuperUserService(repository, makeRedis().service);

        await expect(service.isSuperUser('example.ru', 1)).resolves.toBe(false);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
