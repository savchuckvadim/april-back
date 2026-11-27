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
import { createGlobalValidationPipe } from '@lib/core/bootstrap/global-validation-pipe';
import { PBXService } from '@lib/pbx';
import { KonstructorInnController } from '../controllers/inn.controller';
import { KonstructorInnSetUseCase } from '../use-cases/inn-set.use-case';

/**
 * Ручка пишет ИНН в Битрикс от лица сервера, поэтому её открывает только
 * сессия того портала, чей домен в теле запроса.
 */
const DOMAIN = 'april-garant.bitrix24.ru';
const INN = '7707083893';
const URL = '/konstructor/inn/set';

const SESSIONS: Record<string, AuthJwtPayload> = {
    'own-portal': {
        sub: `portal:${DOMAIN}:447`,
        login: `447@${DOMAIN}`,
        role: Role.CLIENT,
        domain: DOMAIN,
        bitrixUserId: '447',
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
};

const verify = (token: string): AuthJwtPayload => {
    const session = SESSIONS[token];
    if (!session) throw new Error('invalid');
    return session;
};

const body = (extra: Record<string, unknown> = {}) => ({
    domain: DOMAIN,
    inn: INN,
    ...extra,
});

describe('POST konstructor/inn/set', () => {
    const execute = jest.fn();

    const makeApp = async (
        guardMode: PortalSessionGuardMode,
    ): Promise<INestApplication> => {
        const moduleRef = await Test.createTestingModule({
            controllers: [KonstructorInnController],
            providers: [
                PortalSessionGuard,
                { provide: KonstructorInnSetUseCase, useValue: { execute } },
                { provide: AuthTokenService, useValue: { verify } },
                {
                    provide: AUTH_OPTIONS,
                    useValue: { enabled: false, portalSession: { guardMode } },
                },
            ],
        }).compile();
        const app = moduleRef.createNestApplication();
        app.useGlobalPipes(createGlobalValidationPipe());
        await app.init();
        return app;
    };

    const post = (
        app: INestApplication,
        payload: Record<string, unknown>,
        token?: string,
    ) => {
        const call = request(app.getHttpServer() as App)
            .post(URL)
            .send(payload);
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

        beforeEach(() => {
            execute.mockReset();
            execute.mockResolvedValue({
                inn: INN,
                entity: 'deal',
                warnings: [],
            });
        });

        it('сессия своего портала: 200, use-case получает тело, ответ возвращается как есть', async () => {
            const payload = body({
                dealId: 105819,
                companyId: 180875,
                userId: 447,
            });

            const response = await post(app, payload, 'own-portal').expect(200);

            expect(response.body).toEqual({
                inn: INN,
                entity: 'deal',
                warnings: [],
            });
            expect(execute).toHaveBeenCalledTimes(1);
            expect(execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    domain: DOMAIN,
                    inn: INN,
                    dealId: 105819,
                    companyId: 180875,
                    userId: 447,
                }),
            );
        });

        it('только обязательные поля: домен и ИНН', async () => {
            await post(app, body(), 'own-portal').expect(200);

            expect(execute).toHaveBeenCalledWith(
                expect.objectContaining({ domain: DOMAIN, inn: INN }),
            );
        });

        it('без токена: 401, запись не начата', async () => {
            await post(app, body()).expect(401);
            expect(execute).not.toHaveBeenCalled();
        });

        it('чужой или просроченный токен: 401', async () => {
            await post(app, body(), 'forged').expect(401);
            expect(execute).not.toHaveBeenCalled();
        });

        it('сессия другого портала: 403, ИНН чужого портала не пишется', async () => {
            await post(app, body(), 'other-portal').expect(403);
            expect(execute).not.toHaveBeenCalled();
        });

        it.each([
            ['нет домена', { inn: INN }],
            ['нет ИНН', { domain: DOMAIN }],
            ['пустой ИНН', body({ inn: '' })],
            ['dealId меньше 1', body({ dealId: 0 })],
            ['companyId не число', body({ companyId: 'abc' })],
            ['leadId дробный', body({ leadId: 1.5 })],
            ['userId отрицательный', body({ userId: -3 })],
        ])('%s: 400, запись не начата', async (_label, payload) => {
            // нет домена в теле: гард пропускает (сверять нечего), валидация режет
            await post(app, payload, 'own-portal').expect(400);
            expect(execute).not.toHaveBeenCalled();
        });
    });

    it('report: без токена запрос проходит, нарушение только в лог (выкатка фронта)', async () => {
        const app = await makeApp('report');
        execute.mockReset();
        execute.mockResolvedValue({
            inn: INN,
            entity: 'company',
            warnings: [],
        });
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);

        await post(app, body({ companyId: 180875 })).expect(200);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('missing_token'),
        );

        warn.mockRestore();
        await app.close();
    });

    it('ошибки домена доходят до клиента кодами 400 и 409 (use-case с настоящим переводом)', async () => {
        const closedDeal = {
            api: {
                call: (method: string): Promise<unknown> =>
                    Promise.resolve({
                        result:
                            method === 'crm.deal.get'
                                ? { ID: '100', CLOSED: 'Y' }
                                : [],
                    }),
            },
            user: { get: () => Promise.resolve({ result: [] }) },
            requisite: { getList: () => Promise.resolve({ result: [] }) },
            requisiteLink: { getList: () => Promise.resolve({ result: [] }) },
            requisitePreset: { getList: () => Promise.resolve({ result: [] }) },
        };
        const pbx = {
            init: () =>
                Promise.resolve({
                    bitrix: closedDeal,
                    PortalModel: {
                        getEntityFieldByCode: () => ({ bitrixId: 'OP_INN' }),
                        getFieldBitrixId: (f: { bitrixId: string }) =>
                            `UF_CRM_${f.bitrixId}`,
                    },
                }),
        };
        const moduleRef = await Test.createTestingModule({
            controllers: [KonstructorInnController],
            providers: [
                PortalSessionGuard,
                KonstructorInnSetUseCase,
                { provide: PBXService, useValue: pbx },
                { provide: AuthTokenService, useValue: { verify } },
                {
                    provide: AUTH_OPTIONS,
                    useValue: {
                        enabled: false,
                        portalSession: { guardMode: 'off' },
                    },
                },
            ],
        }).compile();
        const app = moduleRef.createNestApplication();
        app.useGlobalPipes(createGlobalValidationPipe());
        await app.init();

        await post(app, body({ inn: '1234567890', companyId: 55 })).expect(400);
        await post(app, body({ dealId: 100 })).expect(409);

        await app.close();
    });
});
