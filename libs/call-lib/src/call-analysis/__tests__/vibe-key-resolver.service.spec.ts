import { VibeKeyResolverService } from '../services/vibe-key-resolver.service';

const DOMAIN = 'test.bitrix24.ru';

const makeService = (options?: {
    portal?: { id: number } | null;
    portalKey?: string | null;
}) => {
    const portalStore = {
        getPortalByDomain: jest
            .fn()
            .mockResolvedValue(
                options?.portal === undefined ? { id: 5 } : options.portal,
            ),
    };
    const portalKeys = {
        get: jest.fn().mockResolvedValue(options?.portalKey ?? null),
    };
    const service = new VibeKeyResolverService(
        portalStore as never,
        portalKeys as never,
    );
    return { service, portalStore, portalKeys };
};

describe('VibeKeyResolverService', () => {
    it('отдаёт расшифрованный vibeKey портала', async () => {
        const { service, portalKeys } = makeService({
            portalKey: 'portal-key',
        });
        await expect(service.resolve(DOMAIN)).resolves.toBe('portal-key');
        expect(portalKeys.get).toHaveBeenCalledWith(5, 'vibeKey');
    });

    it('портал не найден — понятная ошибка', async () => {
        const { service } = makeService({ portal: null });
        await expect(service.resolve(DOMAIN)).rejects.toThrow(
            'портал test.bitrix24.ru не найден',
        );
    });

    it('vibeKey не заведён — ошибка с адресом админки', async () => {
        const { service } = makeService({ portalKey: null });
        await expect(service.resolve(DOMAIN)).rejects.toThrow(
            'admin/portal/5/keys',
        );
    });

    it('ключ кэшируется в памяти (одно чтение БД на серию вызовов)', async () => {
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
