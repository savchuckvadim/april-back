import { AuthTokenService, Role } from '@lib/auth';
import { RedisService } from '@/core/redis/redis.service';
import {
    MarketplaceSessionService,
    PortalSessionState,
} from '../services/marketplace-session.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import { InstallChannel } from '../lib/parse-install-params.util';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        'findInstallWithClient' | 'getApplicationToken'
    >
>;
type BxMock = jest.Mocked<Pick<MarketplaceBxClient, 'getProfile'>>;
type AuthMock = jest.Mocked<Pick<AuthTokenService, 'sign'>>;

/** In-memory замена Redis-клиенту (set/get/del c EX) */
const createRedisMock = () => {
    const store = new Map<string, string>();
    return {
        store,
        service: {
            getClient: () => ({
                set: jest.fn((key: string, value: string) => {
                    store.set(key, value);
                    return Promise.resolve('OK');
                }),
                get: jest.fn((key: string) =>
                    Promise.resolve(store.get(key) ?? null),
                ),
                del: jest.fn((key: string) => {
                    store.delete(key);
                    return Promise.resolve(1);
                }),
            }),
        } as unknown as RedisService,
    };
};

const openPayload = {
    channel: InstallChannel.OPEN,
    access_token: 'at',
    refresh_token: 'rt',
    expires_in: 3600,
    domain: 'april-dev.bitrix24.ru',
    member_id: 'member-1',
    application_token: 'app-token',
};

const installWith = (
    approvalStatus: string | null,
    clientId: bigint | null,
) => ({
    id: 'install-uuid',
    uninstalled_at: null,
    portals: {
        id: BigInt(7),
        approval_status: approvalStatus,
        client_id: clientId,
        clients: null,
    },
});

describe('MarketplaceSessionService (гейт + сессия)', () => {
    let service: MarketplaceSessionService;
    let repo: RepoMock;
    let bx: BxMock;
    let auth: AuthMock;
    let redis: ReturnType<typeof createRedisMock>;

    beforeEach(() => {
        repo = {
            findInstallWithClient: jest
                .fn()
                .mockResolvedValue(installWith('pending', null)),
            getApplicationToken: jest.fn().mockReturnValue('app-token'),
        };
        bx = {
            getProfile: jest.fn().mockResolvedValue({
                ok: true,
                id: '1',
                name: 'Иван',
                lastName: 'Петров',
                isAdmin: true,
            }),
        };
        auth = { sign: jest.fn().mockReturnValue('signed-jwt') };
        redis = createRedisMock();

        service = new MarketplaceSessionService(
            repo as unknown as MarketplaceInstallRepository,
            bx as unknown as MarketplaceBxClient,
            auth as unknown as AuthTokenService,
            redis.service,
        );
    });

    describe('матрица состояний допуска', () => {
        it.each([
            ['pending', null, PortalSessionState.ONBOARDING],
            ['pending', BigInt(5), PortalSessionState.PENDING],
            ['approved', BigInt(5), PortalSessionState.ACTIVE],
            [null, null, PortalSessionState.ACTIVE], // легаси = допущен
            ['blocked', BigInt(5), PortalSessionState.BLOCKED],
        ] as const)(
            'approval_status=%s, client_id=%s → %s',
            async (approval, clientId, expected) => {
                repo.findInstallWithClient.mockResolvedValue(
                    installWith(approval, clientId) as unknown as Awaited<
                        ReturnType<
                            MarketplaceInstallRepository['findInstallWithClient']
                        >
                    >,
                );
                const result = await service.openSession(openPayload);
                expect(result.ok).toBe(true);
                expect(result.state).toBe(expected);
                expect(result.code).toBeDefined();
            },
        );
    });

    it('выпускает канонический portal-context JWT (role=CLIENT, portalId, clientId)', async () => {
        repo.findInstallWithClient.mockResolvedValue(
            installWith('approved', BigInt(5)) as unknown as Awaited<
                ReturnType<
                    MarketplaceInstallRepository['findInstallWithClient']
                >
            >,
        );
        await service.openSession(openPayload);

        expect(auth.sign).toHaveBeenCalledWith(
            expect.objectContaining({
                sub: 'member-1',
                role: Role.CLIENT,
                portalId: 7,
                clientId: 5,
            }),
        );
    });

    it('установка не найдена → ok=false, not_installed, REST не дёргается', async () => {
        repo.findInstallWithClient.mockResolvedValue(null);
        const result = await service.openSession(openPayload);
        expect(result).toEqual({ ok: false, reason: 'not_installed' });
        expect(bx.getProfile).not.toHaveBeenCalled();
    });

    it('подложный application_token → ok=false, token_mismatch', async () => {
        repo.getApplicationToken.mockReturnValue('other-token');
        const result = await service.openSession(openPayload);
        expect(result).toEqual({ ok: false, reason: 'token_mismatch' });
    });

    it('мёртвый AUTH_ID (profile REST упал) → ok=false, rest_verify_failed', async () => {
        bx.getProfile.mockResolvedValue({
            ok: false,
            isAdmin: false,
            error: 'expired_token',
        });
        const result = await service.openSession(openPayload);
        expect(result).toEqual({ ok: false, reason: 'rest_verify_failed' });
        expect(auth.sign).not.toHaveBeenCalled();
    });

    it('exchangeCode: код одноразовый — второй обмен возвращает null', async () => {
        const opened = await service.openSession(openPayload);
        expect(opened.code).toBeDefined();

        const first = await service.exchangeCode(opened.code as string);
        expect(first?.token).toBe('signed-jwt');
        expect(first?.memberId).toBe('member-1');
        expect(first?.user.isAdmin).toBe(true);

        const second = await service.exchangeCode(opened.code as string);
        expect(second).toBeNull();
    });

    it('exchangeCode: неизвестный код → null', async () => {
        expect(await service.exchangeCode('no-such-code')).toBeNull();
    });
});
