import { NotFoundException } from '@nestjs/common';
import { PortalKeysService } from './portal-keys.service';
import { PortalKeyCryptoService } from './portal-key-crypto.service';
import { PortalRepository } from '../portal.repository';
import { PortalKeysRecord } from './portal-key.const';

const emptyKeys = (): PortalKeysRecord => ({
    nestKey: null,
    nestKonstructorKey: null,
    nestReportKey: null,
    nestEventsKey: null,
    nestServiceKey: null,
    nestWebhooksKey: null,
    nestScheduleKey: null,
    vibeKey: null,
});

describe('PortalKeysService', () => {
    let service: PortalKeysService;
    let repo: jest.Mocked<Pick<PortalRepository, 'findKeysById' | 'updateKey'>>;
    let crypto: PortalKeyCryptoService;

    beforeEach(() => {
        process.env.APP_SECRET_KEY = 'test-secret-key';
        crypto = new PortalKeyCryptoService();
        repo = {
            findKeysById: jest.fn(),
            updateKey: jest.fn(),
        };
        service = new PortalKeysService(
            repo as unknown as PortalRepository,
            crypto,
        );
    });

    describe('set', () => {
        it('шифрует значение и передаёт его в репозиторий', async () => {
            repo.findKeysById.mockResolvedValue(emptyKeys());

            await service.set(1, 'nestKey', 'plain-secret');

            expect(repo.updateKey).toHaveBeenCalledTimes(1);
            const [portalId, key, stored] = repo.updateKey.mock.calls[0];
            expect(portalId).toBe(1);
            expect(key).toBe('nestKey');
            expect(stored).not.toBe('plain-secret');
            expect(crypto.decrypt(stored as string)).toBe('plain-secret');
        });

        it('бросает NotFound, если портал не найден', async () => {
            repo.findKeysById.mockResolvedValue(null);

            await expect(service.set(99, 'nestKey', 'x')).rejects.toThrow(
                NotFoundException,
            );
            expect(repo.updateKey).not.toHaveBeenCalled();
        });
    });

    describe('get / getAll', () => {
        it('возвращает расшифрованное значение', async () => {
            const keys = emptyKeys();
            keys.vibeKey = crypto.encrypt('vibe-value');
            repo.findKeysById.mockResolvedValue(keys);

            expect(await service.get(1, 'vibeKey')).toBe('vibe-value');
        });

        it('возвращает null для незаданного ключа', async () => {
            repo.findKeysById.mockResolvedValue(emptyKeys());

            expect(await service.get(1, 'nestKey')).toBeNull();
        });

        it('getAll расшифровывает все заданные ключи', async () => {
            const keys = emptyKeys();
            keys.nestKey = crypto.encrypt('a');
            keys.vibeKey = crypto.encrypt('b');
            repo.findKeysById.mockResolvedValue(keys);

            const result = await service.getAll(1);

            expect(result.nestKey).toBe('a');
            expect(result.vibeKey).toBe('b');
            expect(result.nestReportKey).toBeNull();
        });

        it('возвращает null, если значение не расшифровывается', async () => {
            const keys = emptyKeys();
            keys.nestKey = 'corrupted:payload';
            repo.findKeysById.mockResolvedValue(keys);

            expect(await service.get(1, 'nestKey')).toBeNull();
        });
    });

    describe('delete', () => {
        it('записывает null в репозиторий', async () => {
            repo.findKeysById.mockResolvedValue(emptyKeys());

            await service.delete(1, 'nestKey');

            expect(repo.updateKey).toHaveBeenCalledWith(1, 'nestKey', null);
        });
    });
});
