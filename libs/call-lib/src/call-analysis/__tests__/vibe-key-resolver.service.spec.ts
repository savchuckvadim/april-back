import { VibeKeyResolverService } from '../services/vibe-key-resolver.service';

const DOMAIN = 'test.bitrix24.ru';

const makeService = (options?: {
    portal?: { id: number } | null;
    portalKey?: string | null;
    portalError?: boolean;
    envKey?: string;
}) => {
    const portalStore = {
        getPortalByDomain: options?.portalError
            ? jest.fn().mockRejectedValue(new Error('db down'))
            : jest.fn().mockResolvedValue(options?.portal ?? { id: 5 }),
    };
    const portalKeys = {
        get: jest.fn().mockResolvedValue(options?.portalKey ?? null),
    };
    const config = {
        get: jest.fn((key: string) =>
            key === 'BITRIX_VIBE_TEST' ? options?.envKey : undefined,
        ),
    };
    const service = new VibeKeyResolverService(
        portalStore as never,
        portalKeys as never,
        config as never,
    );
    return { service, portalStore, portalKeys };
};

describe('VibeKeyResolverService', () => {
    it('ключ портала имеет приоритет над env', async () => {
        const { service, portalKeys } = makeService({
            portalKey: 'portal-key',
            envKey: 'env-key',
        });
        await expect(service.resolve(DOMAIN)).resolves.toBe('portal-key');
        expect(portalKeys.get).toHaveBeenCalledWith(5, 'vibeKey');
    });

    it('нет ключа портала — fallback на env', async () => {
        const { service } = makeService({ portalKey: null, envKey: 'env-key' });
        await expect(service.resolve(DOMAIN)).resolves.toBe('env-key');
    });

    it('ошибка чтения портала не роняет вызов — env-fallback', async () => {
        const { service } = makeService({
            portalError: true,
            envKey: 'env-key',
        });
        await expect(service.resolve(DOMAIN)).resolves.toBe('env-key');
    });

    it('нет ни ключа портала, ни env — понятная ошибка', async () => {
        const { service } = makeService({ portalKey: null });
        await expect(service.resolve(DOMAIN)).rejects.toThrow(
            'VibeCode-ключ не найден',
        );
    });

    it('ключ портала кэшируется в памяти (одно чтение БД на серию вызовов)', async () => {
        const { service, portalStore } = makeService({
            portalKey: 'portal-key',
        });
        await service.resolve(DOMAIN);
        await service.resolve(DOMAIN);
        await service.resolve(DOMAIN);
        expect(portalStore.getPortalByDomain).toHaveBeenCalledTimes(1);
    });

    it('invalidate сбрасывает кэш домена', async () => {
        const { service, portalStore } = makeService({
            portalKey: 'portal-key',
        });
        await service.resolve(DOMAIN);
        service.invalidate(DOMAIN);
        await service.resolve(DOMAIN);
        expect(portalStore.getPortalByDomain).toHaveBeenCalledTimes(2);
    });
});
