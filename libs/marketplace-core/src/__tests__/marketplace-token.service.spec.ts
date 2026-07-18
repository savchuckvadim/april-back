import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { RedisService } from '@/core/redis/redis.service';
import { MarketplaceTokenService } from '../refresh/marketplace-token.service';
import {
    ActiveInstall,
    MarketplaceAuthRepository,
} from '../persistence/marketplace-auth.repository';
import {
    MarketplaceTokenError,
    MarketplaceTokenErrorCode,
} from '../domain/marketplace-token.errors';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceAuthRepository,
        | 'findActiveInstall'
        | 'findInstallById'
        | 'getDecryptedTokens'
        | 'saveRefreshedTokens'
        | 'findAppSecrets'
        | 'logTokenEvent'
    >
>;

interface RedisClientMock {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
}

const makeInstall = (expiresInMs: number): ActiveInstall =>
    ({
        id: 'install-uuid',
        expires_at: new Date(Date.now() + expiresInMs),
        access_token: 'enc-access',
        refresh_token: 'enc-refresh',
        uninstalled_at: null,
        portals: {
            id: BigInt(1),
            domain: 'april-dev.bitrix24.ru',
            member_id: 'member-1',
        },
    }) as unknown as ActiveInstall;

const axiosResponse = (data: unknown): AxiosResponse => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
});

describe('MarketplaceTokenService (refresh токенов маркетплейса)', () => {
    let service: MarketplaceTokenService;
    let repo: RepoMock;
    let redisClient: RedisClientMock;
    let httpGet: jest.Mock;

    beforeEach(() => {
        repo = {
            findActiveInstall: jest.fn(),
            findInstallById: jest.fn(),
            getDecryptedTokens: jest.fn().mockReturnValue({
                accessToken: 'access-plain',
                refreshToken: 'refresh-plain',
            }),
            saveRefreshedTokens: jest.fn().mockResolvedValue(undefined),
            // По умолчанию строки в bitrix_app_secrets нет → env-фолбэк
            findAppSecrets: jest.fn().mockResolvedValue(null),
            logTokenEvent: jest.fn().mockResolvedValue(undefined),
        };
        redisClient = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
        };
        httpGet = jest.fn();

        const redisService = {
            getClient: () => redisClient,
        } as unknown as RedisService;
        const http = { get: httpGet } as unknown as HttpService;
        const configService = {
            get: jest.fn((key: string) => {
                if (key === 'MARKETPLACE_CLIENT_ID') return 'app.client.id';
                if (key === 'MARKETPLACE_CLIENT_SECRET') return 'secret';
                return undefined;
            }),
        } as unknown as ConfigService;

        service = new MarketplaceTokenService(
            repo as unknown as MarketplaceAuthRepository,
            redisService,
            http,
            configService,
        );
    });

    it('свежий токен (>5 мин до истечения) — отдаётся без refresh', async () => {
        repo.findActiveInstall.mockResolvedValue(makeInstall(60 * 60 * 1000));

        const token = await service.getFreshAccessToken({
            memberId: 'member-1',
        });

        expect(token).toBe('access-plain');
        expect(httpGet).not.toHaveBeenCalled();
        expect(repo.saveRefreshedTokens).not.toHaveBeenCalled();
    });

    it('протухающий токен — refresh через oauth, сохранение новой пары', async () => {
        repo.findActiveInstall.mockResolvedValue(makeInstall(60 * 1000));
        httpGet.mockReturnValue(
            of(
                axiosResponse({
                    access_token: 'new-access',
                    refresh_token: 'new-refresh',
                    expires_in: 3600,
                }),
            ),
        );

        const token = await service.getFreshAccessToken({
            memberId: 'member-1',
        });

        expect(token).toBe('new-access');
        expect(repo.saveRefreshedTokens).toHaveBeenCalledWith(
            'install-uuid',
            expect.objectContaining({
                accessToken: 'new-access',
                refreshToken: 'new-refresh',
            }),
        );
        expect(repo.logTokenEvent).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'processed' }),
        );
        // лок взят и снят
        expect(redisClient.set).toHaveBeenCalledWith(
            'mp:token:refresh:install-uuid',
            '1',
            'PX',
            expect.any(Number),
            'NX',
        );
        expect(redisClient.del).toHaveBeenCalled();
    });

    it('нет активной установки → NO_INSTALL', async () => {
        repo.findActiveInstall.mockResolvedValue(null);

        await expect(
            service.getFreshAccessToken({ memberId: 'ghost' }),
        ).rejects.toMatchObject({
            code: MarketplaceTokenErrorCode.NO_INSTALL,
        });
    });

    it('invalid_grant (портал спал >28 дней) → REFRESH_INVALID + журнал', async () => {
        repo.findActiveInstall.mockResolvedValue(makeInstall(0));
        httpGet.mockReturnValue(
            of(
                axiosResponse({
                    error: 'invalid_grant',
                    error_description: 'refresh token expired',
                }),
            ),
        );

        await expect(
            service.getFreshAccessToken({ memberId: 'member-1' }),
        ).rejects.toMatchObject({
            code: MarketplaceTokenErrorCode.REFRESH_INVALID,
        });
        expect(repo.logTokenEvent).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'error' }),
        );
    });

    it('сетевая ошибка OAuth → OAUTH_UNAVAILABLE', async () => {
        repo.findActiveInstall.mockResolvedValue(makeInstall(0));
        httpGet.mockReturnValue(
            throwError(() => new AxiosError('ECONNREFUSED')),
        );

        await expect(
            service.getFreshAccessToken({ memberId: 'member-1' }),
        ).rejects.toMatchObject({
            code: MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE,
        });
    });

    it('нет refresh_token в установке → NO_REFRESH_TOKEN', async () => {
        repo.findActiveInstall.mockResolvedValue(makeInstall(0));
        repo.getDecryptedTokens.mockReturnValue({
            accessToken: null,
            refreshToken: null,
        });

        await expect(
            service.getFreshAccessToken({ memberId: 'member-1' }),
        ).rejects.toMatchObject({
            code: MarketplaceTokenErrorCode.NO_REFRESH_TOKEN,
        });
    });

    it('лок занят конкурентом → ожидание и выдача обновлённого из БД', async () => {
        repo.findActiveInstall.mockResolvedValue(makeInstall(0));
        redisClient.set.mockResolvedValue(null); // лок не взят
        // конкурент успел обновить: в БД свежая запись
        repo.findInstallById.mockResolvedValue(makeInstall(3600 * 1000));
        repo.getDecryptedTokens.mockReturnValue({
            accessToken: 'concurrent-access',
            refreshToken: 'refresh-plain',
        });

        const token = await service.getFreshAccessToken({
            memberId: 'member-1',
        });

        expect(token).toBe('concurrent-access');
        expect(httpGet).not.toHaveBeenCalled();
    }, 10000);

    it('креды из bitrix_app_secrets приоритетнее env (источник истины — БД)', async () => {
        repo.findActiveInstall.mockResolvedValue(makeInstall(0));
        repo.findAppSecrets.mockResolvedValue({
            clientId: 'db.client.id',
            clientSecret: 'db-secret',
        });
        httpGet.mockReturnValue(
            of(
                axiosResponse({
                    access_token: 'new-access',
                    refresh_token: 'new-refresh',
                    expires_in: 3600,
                }),
            ),
        );

        await service.getFreshAccessToken({ memberId: 'member-1' });

        expect(repo.findAppSecrets).toHaveBeenCalledWith('garant_manager');
        const [, requestConfig] = httpGet.mock.calls[0] as [
            string,
            { params: Record<string, string> },
        ];
        expect(requestConfig.params.client_id).toBe('db.client.id');
        expect(requestConfig.params.client_secret).toBe('db-secret');
    });

    it('нет ни строки в БД, ни env-кред → OAUTH_UNAVAILABLE с понятным текстом', async () => {
        repo.findActiveInstall.mockResolvedValue(makeInstall(0));
        const emptyConfig = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;
        const bare = new MarketplaceTokenService(
            repo as unknown as MarketplaceAuthRepository,
            { getClient: () => redisClient } as unknown as RedisService,
            { get: httpGet } as unknown as HttpService,
            emptyConfig,
        );

        await expect(
            bare.getFreshAccessToken({ memberId: 'member-1' }),
        ).rejects.toMatchObject({
            code: MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE,
        });
        expect(httpGet).not.toHaveBeenCalled();
    });

    it('MarketplaceTokenError несёт код и русское сообщение', () => {
        const error = new MarketplaceTokenError(
            MarketplaceTokenErrorCode.REFRESH_INVALID,
            'тест',
        );
        expect(error.code).toBe(MarketplaceTokenErrorCode.REFRESH_INVALID);
        expect(error.name).toBe('MarketplaceTokenError');
    });

    describe('hasActiveInstall (детект для PBXService)', () => {
        it('кэш-хит: БД не трогается', async () => {
            redisClient.get.mockResolvedValue('1');
            const has = await service.hasActiveInstall('april-dev.bitrix24.ru');
            expect(has).toBe(true);
            expect(repo.findActiveInstall).not.toHaveBeenCalled();
        });

        it('кэш-мисс: БД + запись в кэш', async () => {
            redisClient.get.mockResolvedValue(null);
            repo.findActiveInstall.mockResolvedValue(makeInstall(1000));

            const has = await service.hasActiveInstall('april-dev.bitrix24.ru');

            expect(has).toBe(true);
            expect(redisClient.set).toHaveBeenCalledWith(
                'mp:install:active:april-dev.bitrix24.ru',
                '1',
                'EX',
                expect.any(Number),
            );
        });

        it('нет установки → false (кэшируется как 0)', async () => {
            redisClient.get.mockResolvedValue(null);
            repo.findActiveInstall.mockResolvedValue(null);

            const has = await service.hasActiveInstall('legacy.bitrix24.ru');

            expect(has).toBe(false);
            expect(redisClient.set).toHaveBeenCalledWith(
                'mp:install:active:legacy.bitrix24.ru',
                '0',
                'EX',
                expect.any(Number),
            );
        });
    });
});
