import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    type AuthJwtPayload,
    AuthTokenService,
    PortalSessionGuard,
    Role,
} from '@lib/auth';
import { AUTH_OPTIONS } from '@lib/auth/config/auth.constants';
import type { PortalSessionGuardMode } from '@lib/auth/portal-session/portal-session.const';
import { KonstructorInitController } from '../konstructor-init.controller';
import { KonstructorInitUseCase } from '../konstructor-init.use-case';

/**
 * Каталог с ценами — только сессии своего портала. Без этого его получал
 * любой, кто знает адрес API и домен портала, и отзыв публичной ссылки
 * ничего не закрывал.
 */
const DOMAIN = 'april-garant.bitrix24.ru';
const CATALOG = { prices: [{ id: 1, value: 100 }] };

const SESSIONS: Record<string, AuthJwtPayload> = {
    'own-portal': {
        sub: `portal:${DOMAIN}:7`,
        login: `7@${DOMAIN}`,
        role: Role.CLIENT,
        domain: DOMAIN,
        bitrixUserId: '7',
        isAdmin: false,
    },
    'other-portal': {
        sub: 'portal:gsr.bitrix24.ru:9',
        login: '9@gsr.bitrix24.ru',
        role: Role.CLIENT,
        domain: 'gsr.bitrix24.ru',
        bitrixUserId: '9',
        isAdmin: false,
    },
    admin: { sub: 'admin', login: 'admin', role: Role.SUPER_USER },
};

const verify = (token: string): AuthJwtPayload => {
    const session = SESSIONS[token];
    if (!session) throw new Error('invalid');
    return session;
};

describe('POST konstructor/init/data: только сессия портала', () => {
    const init = jest.fn().mockResolvedValue(CATALOG);

    const makeApp = async (
        guardMode: PortalSessionGuardMode,
    ): Promise<INestApplication> => {
        const moduleRef = await Test.createTestingModule({
            controllers: [KonstructorInitController],
            providers: [
                PortalSessionGuard,
                { provide: KonstructorInitUseCase, useValue: { init } },
                { provide: AuthTokenService, useValue: { verify } },
                {
                    provide: AUTH_OPTIONS,
                    useValue: { enabled: false, portalSession: { guardMode } },
                },
            ],
        }).compile();
        const app = moduleRef.createNestApplication();
        await app.init();
        return app;
    };

    const post = (app: INestApplication, token?: string) => {
        const call = request(app.getHttpServer() as App)
            .post('/konstructor/init/data')
            .send({ domain: DOMAIN });
        return token ? call.set('Authorization', `Bearer ${token}`) : call;
    };

    describe('enforce', () => {
        let app: INestApplication;

        beforeAll(async () => {
            app = await makeApp('enforce');
        });

        afterAll(async () => {
            await app.close();
        });

        beforeEach(() => init.mockClear());

        it('без токена — 401, каталог не считается', async () => {
            await post(app).expect(401);
            expect(init).not.toHaveBeenCalled();
        });

        it('чужой или просроченный токен — 401', async () => {
            await post(app, 'forged').expect(401);
            expect(init).not.toHaveBeenCalled();
        });

        it('сессия другого портала — 403', async () => {
            await post(app, 'other-portal').expect(403);
            expect(init).not.toHaveBeenCalled();
        });

        it('токен админки — 403: каталог фрейма только для сессии портала', async () => {
            await post(app, 'admin').expect(403);
            expect(init).not.toHaveBeenCalled();
        });

        it('сессия своего портала получает каталог', async () => {
            const response = await post(app, 'own-portal').expect(201);
            expect(response.body).toEqual(CATALOG);
            expect(init).toHaveBeenCalledWith(DOMAIN);
        });
    });

    it('report: без токена запрос проходит, нарушение только в лог (выкатка фронта)', async () => {
        const app = await makeApp('report');
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);

        await post(app).expect(201);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('missing_token'),
        );

        warn.mockRestore();
        await app.close();
    });
});
