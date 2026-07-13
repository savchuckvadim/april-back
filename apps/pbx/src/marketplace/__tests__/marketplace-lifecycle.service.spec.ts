import {
    MarketplaceLifecycleService,
    parseLifecycleEvent,
} from '../services/marketplace-lifecycle.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        | 'findInstallByMemberId'
        | 'getApplicationToken'
        | 'markUninstalled'
        | 'updateInstallStatus'
        | 'applyUpdate'
        | 'logEvent'
    >
>;

describe('parseLifecycleEvent', () => {
    it('разбирает вложенный auth (extended urlencoded)', () => {
        const payload = parseLifecycleEvent({
            event: 'onappuninstall',
            auth: {
                member_id: 'member-1',
                domain: 'portal.bitrix24.ru',
                application_token: 'app-token',
            },
            data: { CLEAN: '1' },
        });
        expect(payload.event).toBe('ONAPPUNINSTALL');
        expect(payload.memberId).toBe('member-1');
        expect(payload.applicationToken).toBe('app-token');
        expect(payload.clean).toBe('1');
    });

    it('разбирает плоские ключи auth[...]', () => {
        const payload = parseLifecycleEvent({
            event: 'ONAPPUPDATE',
            'auth[member_id]': 'member-1',
            'auth[application_token]': 'app-token',
        });
        expect(payload.memberId).toBe('member-1');
        expect(payload.applicationToken).toBe('app-token');
    });
});

describe('MarketplaceLifecycleService', () => {
    let service: MarketplaceLifecycleService;
    let repo: RepoMock;

    const validBody = {
        event: 'ONAPPUNINSTALL',
        auth: {
            member_id: 'member-1',
            domain: 'portal.bitrix24.ru',
            application_token: 'app-token',
        },
        data: { CLEAN: '0' },
    };

    beforeEach(() => {
        repo = {
            findInstallByMemberId: jest
                .fn()
                .mockResolvedValue({ id: 'install-uuid' }),
            getApplicationToken: jest.fn().mockReturnValue('app-token'),
            markUninstalled: jest.fn().mockResolvedValue(undefined),
            updateInstallStatus: jest.fn().mockResolvedValue(undefined),
            applyUpdate: jest.fn().mockResolvedValue(undefined),
            logEvent: jest.fn().mockResolvedValue(undefined),
        };
        service = new MarketplaceLifecycleService(
            repo as unknown as MarketplaceInstallRepository,
        );
    });

    it('ONAPPUNINSTALL с валидным application_token → soft-delete', async () => {
        const result = await service.handleEvent(validBody);
        expect(result.status).toBe('processed');
        expect(repo.markUninstalled).toHaveBeenCalledWith('install-uuid');
    });

    it('подложный application_token → rejected, ничего не меняется', async () => {
        repo.getApplicationToken.mockReturnValue('other-token');
        const result = await service.handleEvent(validBody);
        expect(result.status).toBe('rejected');
        expect(repo.markUninstalled).not.toHaveBeenCalled();
    });

    it('установка не найдена → rejected', async () => {
        repo.findInstallByMemberId.mockResolvedValue(null);
        const result = await service.handleEvent(validBody);
        expect(result.status).toBe('rejected');
    });

    it('ONAPPUPDATE: сохраняет version/scope и НОВЫЙ application_token', async () => {
        const result = await service.handleEvent({
            event: 'ONAPPUPDATE',
            auth: {
                member_id: 'member-1',
                application_token: 'app-token',
                scope: 'crm,placement,user',
            },
            data: { VERSION: '2' },
        });
        expect(result.status).toBe('processed');
        expect(repo.applyUpdate).toHaveBeenCalledWith('install-uuid', {
            version: '2',
            scope: 'crm,placement,user',
            applicationToken: 'app-token',
        });
    });

    it('неизвестное событие → ignored', async () => {
        const result = await service.handleEvent({
            event: 'ONSOMETHINGELSE',
            auth: {
                member_id: 'member-1',
                application_token: 'app-token',
            },
        });
        expect(result.status).toBe('ignored');
    });
});
