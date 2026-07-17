import { NotFoundException } from '@nestjs/common';
import { PortalKeysService } from '@lib/portal-lib/store/keys/portal-keys.service';
import { BackendPortalBuilderService } from '../services/backend-portal-builder.service';
import { PortalAggregateRepository } from '../repositories/portal-aggregate.repository';
import {
    aggregateFixture,
    callingRow,
    listRow,
    portalRow,
    smartRow,
} from './fixtures';

describe('BackendPortalBuilderService', () => {
    const createService = (
        aggregate: ReturnType<typeof aggregateFixture> | null,
        nestKey: string | null = 'decrypted-nest-key',
    ): { service: BackendPortalBuilderService; keysGet: jest.Mock } => {
        const keysGet = jest.fn().mockResolvedValue(nestKey);
        const service = new BackendPortalBuilderService(
            {
                findByDomain: jest.fn().mockResolvedValue(aggregate),
                findById: jest.fn().mockResolvedValue(aggregate),
            } as unknown as PortalAggregateRepository,
            { get: keysGet } as unknown as PortalKeysService,
        );
        return { service, keysGet };
    };

    it('кидает NotFoundException, если портала нет', async () => {
        const { service } = createService(null);

        await expect(
            service.buildByDomain('unknown.bitrix24.ru'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('берёт key из расшифрованного nestKey через PortalKeysService', async () => {
        const { service, keysGet } = createService(
            aggregateFixture(portalRow()),
        );

        const portal = await service.buildByDomain('test.bitrix24.ru');

        expect(keysGet).toHaveBeenCalledWith(1, 'nestKey');
        expect(portal.key).toBe('decrypted-nest-key');
    });

    it('незаданный nestKey превращается в пустую строку', async () => {
        const { service } = createService(aggregateFixture(portalRow()), null);

        const portal = await service.buildByDomain('test.bitrix24.ru');

        expect(portal.key).toBe('');
    });

    it('legacy-колонки C_REST_* отдаёт как хранятся (Laravel-шифр)', async () => {
        const { service } = createService(aggregateFixture(portalRow()));

        const portal = await service.buildByDomain('test.bitrix24.ru');

        expect(portal.C_REST_CLIENT_ID).toBe('enc-client-id');
        expect(portal.C_REST_CLIENT_SECRET).toBe('enc-secret');
        expect(portal.C_REST_WEB_HOOK_URL).toBe('enc-hook');
        expect(portal.domain).toBe('test.bitrix24.ru');
    });

    it('lists и bitrixLists — один и тот же массив (как в IPortal)', async () => {
        const { service } = createService(
            aggregateFixture(portalRow({ bitrixlists: [listRow()] })),
        );

        const portal = await service.buildByDomain('test.bitrix24.ru');

        expect(portal.lists).toHaveLength(1);
        expect(portal.bitrixLists).toBe(portal.lists);
    });

    it('заполняет smarts, callingGroups, bx_rq и measures', async () => {
        const { service } = createService(
            aggregateFixture(
                portalRow({
                    smarts: [smartRow()],
                    callings: [
                        callingRow(),
                        callingRow({ id: 4n, group: 'service' }),
                    ],
                }),
            ),
        );

        const portal = await service.buildByDomain('test.bitrix24.ru');

        expect(portal.smarts).toHaveLength(1);
        expect(portal.callingGroups).toHaveLength(2);
        expect(portal.bitrixCallingTasksGroup?.group).toBe('sales');
        expect(portal.bx_rq).toEqual([]);
        expect(portal.measures).toEqual([]);
    });

    it('buildById ищет портал по id через репозиторий', async () => {
        const aggregate = aggregateFixture(portalRow());
        const { service } = createService(aggregate);

        const portal = await service.buildById(1);

        expect(portal.id).toBe(1);
    });
});
