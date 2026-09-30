import 'reflect-metadata';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
    type AuthJwtPayload,
    type AuthModuleOptions,
    AuthTokenService,
    PortalSessionGuard,
    Role,
} from '@lib/auth';
import { AUTH_OPTIONS } from '@lib/auth/config/auth.constants';
import { AI_ABOUT_ROUTE } from '../about/ai-analytics-about.const';
import { AiAnalyticsAboutController } from '../about/ai-analytics-about.controller';
import { AiAnalyticsForecastController } from '../ai-analytics-forecast.controller';
import { AiAnalyticsOverviewController } from '../ai-analytics-overview.controller';
import { AiAnalyticsPlanController } from '../ai-analytics-plan.controller';
import {
    AI_ROP_MARK_ROUTES,
    AiAnalyticsRopMarkController,
} from '../ai-analytics-rop-mark.controller';
import { AiAnalyticsController } from '../ai-analytics.controller';
import { AI_ANALYTICS_ROUTE_PREFIX } from '../constants/ai-analytics.const';
import { AI_FORECAST_ROUTE } from '../constants/ai-forecast.const';
import { AI_DAILY_PLAN_ROUTE } from '../constants/ai-plan.const';
import { AI_PLAN_FACT_ROUTE } from '../constants/ai-plan-fact.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { AiAnalyticsPlanFactController } from '../plan-fact/ai-analytics-plan-fact.controller';
import { AiAnalyticsReviewController } from '../review/ai-analytics-review.controller';

/**
 * Хвост 2 после Фазы 3 (поток B3): читающие ручки витрины под тем же
 * portal-session guard, что и мутирующие. В режиме enforce запрос без
 * Bearer-токена отвечает 401 и до use-case не доходит; токен другого
 * портала — 403. Отзыв с сайта (review) остаётся открытым: его зовёт
 * сайт продукта без сессии фрейма.
 */

const DOMAIN = 'april.bitrix24.ru';
const BODY = { domain: DOMAIN, requesterUserId: '447' };

const CLIENT: AuthJwtPayload = {
    sub: `portal:${DOMAIN}:447`,
    login: `447@${DOMAIN}`,
    role: Role.CLIENT,
    domain: DOMAIN,
    bitrixUserId: '447',
    isAdmin: false,
};

const OPTIONS: AuthModuleOptions = {
    enabled: true,
    jwt: { secret: 's', expiresIn: '1h' },
    superUser: { login: 'su', passwordHash: 'x' },
    publicPaths: [],
    portalSession: { guardMode: 'enforce' },
};

/** Читающие ручки, которые Фаза 4 закрыла guard'ом. */
const READ_ROUTES = [
    'settings/get',
    'pulse',
    'agenda',
    'feedback/list',
    'overview',
    'attention',
    'by-type',
    AI_ROP_MARK_ROUTES.pick,
    AI_ROP_MARK_ROUTES.list,
    AI_PLAN_FACT_ROUTE,
    AI_FORECAST_ROUTE,
    AI_ABOUT_ROUTE,
] as const;

/** Мутирующие и дорогие ручки — под guard с Фазы 3 (не регрессируют). */
const WRITE_ROUTES = [
    'settings/save',
    'feedback',
    'cache/reset',
    'push',
    AI_ROP_MARK_ROUTES.save,
    AI_DAILY_PLAN_ROUTE,
] as const;

/** Пустая заглушка сервиса: любой метод — jest.fn, до вызова не доходит. */
const stub = (): object =>
    new Proxy(
        {},
        {
            get: (_target, key) => (key === 'then' ? undefined : jest.fn()),
        },
    );

describe('portal-session guard на ручках витрины (enforce)', () => {
    let app: INestApplication;
    let server: Server;
    const access = {
        resolve: jest.fn(),
        resolveViewer: jest.fn(),
        assertLeader: jest.fn(),
    };
    const tokens = {
        verify: jest.fn((token: string) => {
            if (token !== 'good') throw new Error('bad token');
            return CLIENT;
        }),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [
                AiAnalyticsController,
                AiAnalyticsOverviewController,
                AiAnalyticsRopMarkController,
                AiAnalyticsPlanController,
                AiAnalyticsPlanFactController,
                AiAnalyticsForecastController,
                AiAnalyticsAboutController,
            ],
            providers: [
                PortalSessionGuard,
                { provide: AuthTokenService, useValue: tokens },
                { provide: AUTH_OPTIONS, useValue: OPTIONS },
                { provide: RequesterAccessService, useValue: access },
            ],
        })
            .useMocker(stub)
            .compile();
        app = moduleRef.createNestApplication({ logger: false });
        await app.init();
        server = app.getHttpServer() as Server;
    });

    afterAll(async () => {
        await app.close();
    });

    afterEach(() => jest.clearAllMocks());

    it.each([...READ_ROUTES, ...WRITE_ROUTES])(
        '%s: без токена — 401, права и use-case не вызываются',
        async route => {
            await request(server)
                .post(`/${AI_ANALYTICS_ROUTE_PREFIX}/${route}`)
                .send(BODY)
                .expect(401);

            expect(access.resolve).not.toHaveBeenCalled();
            expect(access.resolveViewer).not.toHaveBeenCalled();
        },
    );

    it.each(READ_ROUTES)('%s: невалидный токен — 401', async route => {
        await request(server)
            .post(`/${AI_ANALYTICS_ROUTE_PREFIX}/${route}`)
            .set('Authorization', 'Bearer broken')
            .send(BODY)
            .expect(401);
    });

    it.each(READ_ROUTES)(
        '%s: токен другого портала или пользователя — 403',
        async route => {
            await request(server)
                .post(`/${AI_ANALYTICS_ROUTE_PREFIX}/${route}`)
                .set('Authorization', 'Bearer good')
                .send({ ...BODY, domain: 'other.bitrix24.ru' })
                .expect(403);
            await request(server)
                .post(`/${AI_ANALYTICS_ROUTE_PREFIX}/${route}`)
                .set('Authorization', 'Bearer good')
                .send({ ...BODY, requesterUserId: '512' })
                .expect(403);

            expect(access.resolve).not.toHaveBeenCalled();
            expect(access.resolveViewer).not.toHaveBeenCalled();
        },
    );
});

describe('отзыв с сайта остаётся открытым', () => {
    it('на review нет portal-session guard', () => {
        const names = Object.getOwnPropertyNames(
            AiAnalyticsReviewController.prototype,
        ).filter(name => name !== 'constructor');
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
            const handler = Object.getOwnPropertyDescriptor(
                AiAnalyticsReviewController.prototype,
                name,
            )?.value as object;
            const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ??
                []) as unknown[];
            expect(guards).not.toContain(PortalSessionGuard);
        }
        expect(
            Reflect.getMetadata(GUARDS_METADATA, AiAnalyticsReviewController),
        ).toBeUndefined();
    });
});
