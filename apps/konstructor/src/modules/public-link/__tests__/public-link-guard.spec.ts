import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { type AuthJwtPayload, AuthTokenService, Role } from '@lib/auth';
import { AUTH_OPTIONS } from '@lib/auth/config/auth.constants';
import { PublicAccessController } from '../controllers/public-access.controller';
import { PublicLinkController } from '../controllers/public-link.controller';
import { PublicLinkService } from '../services/public-link.service';

/**
 * Управление ссылками — только токен админки: иначе любой, кто знает адрес API,
 * прочитал бы все токены или отозвал все ссылки. Публичные ручки по токену
 * ссылки остаются без гардов: их зовёт Next-прокси без авторизации.
 */
const ADMIN: AuthJwtPayload = {
    sub: 'admin',
    login: 'admin',
    role: Role.SUPER_USER,
};
const CLIENT: AuthJwtPayload = {
    sub: 'portal:test:1',
    login: '1@test',
    role: Role.CLIENT,
    domain: 'test.bitrix24.ru',
    bitrixUserId: '1',
    isAdmin: false,
};

const TOKENS: Record<string, AuthJwtPayload> = {
    'admin-token': ADMIN,
    'client-token': CLIENT,
};

const verify = (token: string): AuthJwtPayload => {
    const payload = TOKENS[token];
    if (!payload) throw new Error('invalid');
    return payload;
};

describe('доступ к управлению публичными ссылками', () => {
    const links = {
        list: jest.fn().mockResolvedValue([]),
        revokeAll: jest.fn().mockResolvedValue(0),
    };

    const makeApp = async (enabled: boolean): Promise<INestApplication> => {
        const moduleRef = await Test.createTestingModule({
            controllers: [PublicLinkController],
            providers: [
                { provide: PublicLinkService, useValue: links },
                { provide: AuthTokenService, useValue: { verify } },
                {
                    provide: AUTH_OPTIONS,
                    useValue: { enabled, publicPaths: [] },
                },
            ],
        }).compile();
        const app = moduleRef.createNestApplication();
        await app.init();
        return app;
    };

    describe('авторизация включена', () => {
        let app: INestApplication;
        const server = () => request(app.getHttpServer() as App);

        beforeAll(async () => {
            app = await makeApp(true);
        });

        afterAll(async () => {
            await app.close();
        });

        beforeEach(() => {
            links.list.mockClear();
            links.revokeAll.mockClear();
        });

        it('без токена — 401, сервис не вызывается', async () => {
            await server().get('/konstructor/public-links').expect(401);
            await server()
                .post('/konstructor/public-links/revoke-all')
                .expect(401);

            expect(links.list).not.toHaveBeenCalled();
            expect(links.revokeAll).not.toHaveBeenCalled();
        });

        it('чужой токен — 401', async () => {
            await server()
                .get('/konstructor/public-links')
                .set('Authorization', 'Bearer forged')
                .expect(401);
        });

        it('токен клиента портала — 403', async () => {
            await server()
                .get('/konstructor/public-links')
                .set('Authorization', 'Bearer client-token')
                .expect(403);

            expect(links.list).not.toHaveBeenCalled();
        });

        it('токен админки проходит', async () => {
            await server()
                .get('/konstructor/public-links')
                .set('Authorization', 'Bearer admin-token')
                .expect(200);

            expect(links.list).toHaveBeenCalledTimes(1);
        });
    });

    it('AUTH_ENABLED=false: ручки работают без токена, как весь контур до включения', async () => {
        const app = await makeApp(false);

        await request(app.getHttpServer() as App)
            .get('/konstructor/public-links')
            .expect(200);

        await app.close();
    });

    it('публичные ручки по токену ссылки без гардов', () => {
        expect(
            Reflect.getMetadata(GUARDS_METADATA, PublicAccessController),
        ).toBeUndefined();
    });
});
