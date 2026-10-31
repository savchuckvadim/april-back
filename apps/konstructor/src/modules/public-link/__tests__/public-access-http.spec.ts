import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppCacheService } from '@lib/app-cache';
import { GlobalExceptionFilter, ResponseInterceptor } from '@lib/core';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { StorageService } from '@lib/core/storage';
import { ComplectService, InfoblockService } from '@lib/garant';
import { KonstructorInitUseCase } from '../../../init/konstructor-init.use-case';
import { ComplectDescriptionService } from '../../complect-description/services/complect-description.service';
import { PublicAccessController } from '../controllers/public-access.controller';
import { PublicLinkPrismaRepository } from '../repositories/public-link.prisma.repository';
import { PublicCatalogService } from '../services/public-catalog.service';
import { PublicDescriptionService } from '../services/public-description.service';
import { PublicLinkService } from '../services/public-link.service';

/**
 * Публичные ручки целиком: те же пайп, интерсептор и фильтр, что в bootstrapApp.
 * Здесь проверяется то, на что опирается Next-прокси: конверт, статус 410, поток
 * DOCX в обход конверта и ограничения запроса.
 */
const ACTIVE_LINK = {
    id: 'link-1',
    createdAt: null,
    updatedAt: null,
    token: 'live-token',
    portalId: 12n,
    title: 'Служебное название',
    expiresAt: null,
    revokedAt: null,
    viewCount: 0,
    lastViewedAt: null,
    portal: { domain: 'april-garant.bitrix24.ru' },
};

const INIT = {
    contracts: {
        current: [1],
        items: [
            {
                id: 1,
                itemId: 4242,
                measureCode: 796,
                portalMeasure: { bitrixId: '796', portal_id: 12 },
            },
        ],
    },
    measures: [{ id: 2, bitrixId: '796', portalMeasureId: 7 }],
    prices: [{ id: 1, value: 100 }],
};

const DESCRIPTION = {
    complectName: 'Гарант-Бухгалтер',
    supply: '1 ОД',
    groups: [
        {
            name: 'Нормативно-правовые акты',
            infoblocks: [
                { code: 'rus', name: 'Законодательство России' },
                { code: 'alt', name: 'Алтайский край', description: 'С фронта' },
            ],
        },
    ],
};

describe('публичные ручки по токену', () => {
    let app: INestApplication;

    const repository = {
        findByToken: jest.fn((token: string) =>
            Promise.resolve(
                token === ACTIVE_LINK.token
                    ? ACTIVE_LINK
                    : token === 'revoked-token'
                      ? { ...ACTIVE_LINK, revokedAt: new Date('2026-10-01') }
                      : null,
            ),
        ),
        registerView: jest.fn().mockResolvedValue(undefined),
    };
    const storage = { saveFile: jest.fn() };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [PublicAccessController],
            providers: [
                PublicLinkService,
                PublicCatalogService,
                PublicDescriptionService,
                ComplectDescriptionService,
                { provide: PublicLinkPrismaRepository, useValue: repository },
                {
                    provide: KonstructorInitUseCase,
                    useValue: { init: jest.fn().mockResolvedValue(INIT) },
                },
                {
                    provide: AppCacheService,
                    useValue: {
                        remember: (_ref: unknown, factory: () => unknown) =>
                            factory(),
                    },
                },
                {
                    provide: InfoblockService,
                    useValue: {
                        getInfoblocksByCodse: jest.fn().mockResolvedValue([
                            {
                                code: 'rus',
                                name: 'Законодательство России',
                                description: 'Текст из БД',
                            },
                        ]),
                    },
                },
                {
                    provide: ComplectService,
                    useValue: { findAll: jest.fn().mockResolvedValue([]) },
                },
                { provide: StorageService, useValue: storage },
                { provide: FileLinkService, useValue: {} },
                { provide: ConfigService, useValue: { get: () => '' } },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
                transformOptions: { enableImplicitConversion: true },
            }),
        );
        app.useGlobalInterceptors(new ResponseInterceptor());
        app.useGlobalFilters(new GlobalExceptionFilter());
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    const server = () => request(app.getHttpServer());

    it('действующая ссылка: срок в конверте, служебного названия и домена нет', async () => {
        const response = await server()
            .get('/konstructor/public/live-token')
            .expect(200);

        expect(response.body.data).toEqual({ expiresAt: null });
        expect(JSON.stringify(response.body)).not.toContain('april-garant');
    });

    it.each(['revoked-token', 'unknown-token'])(
        '%s: все публичные ручки отвечают 410',
        async token => {
            await server().get(`/konstructor/public/${token}`).expect(410);
            await server()
                .get(`/konstructor/public/${token}/catalog`)
                .expect(410);
            await server()
                .post(`/konstructor/public/${token}/description`)
                .send(DESCRIPTION)
                .expect(410);
        },
    );

    it('каталог: идентификаторы Битрикса обнулены, просмотр посчитан', async () => {
        const response = await server()
            .get('/konstructor/public/live-token/catalog')
            .expect(200);

        const { contracts, measures, prices } = response.body.data;
        expect(contracts.items[0].itemId).toBe(0);
        expect(contracts.items[0].measureCode).toBe(0);
        expect(contracts.items[0].portalMeasure.bitrixId).toBe('');
        expect(measures[0].bitrixId).toBeNull();
        expect(prices).toEqual(INIT.prices);
        expect(repository.registerView).toHaveBeenCalledWith(
            'link-1',
            expect.any(Date),
        );
    });

    it('описание: DOCX потоком в обход конверта, в хранилище ничего не кладётся', async () => {
        const response = await server()
            .post('/konstructor/public/live-token/description')
            .send(DESCRIPTION)
            .buffer(true)
            .parse((res, callback) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            })
            .expect(200);

        expect(response.headers['content-type']).toContain(
            'wordprocessingml.document',
        );
        expect(response.headers['content-disposition']).toContain(
            "filename*=UTF-8''",
        );
        // DOCX — это zip: начинается с PK
        expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');
        expect(storage.saveFile).not.toHaveBeenCalled();
    });

    it('описание: слишком длинное поле отклоняется до сборки файла', async () => {
        await server()
            .post('/konstructor/public/live-token/description')
            .send({ ...DESCRIPTION, complectName: 'x'.repeat(501) })
            .expect(400);
    });
});
