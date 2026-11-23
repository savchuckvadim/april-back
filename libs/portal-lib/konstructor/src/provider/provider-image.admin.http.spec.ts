/**
 * Админ-ручки картинок поставщика на настоящем Nest-приложении: multipart
 * через multer, лимит размера на интерсепторе, ParseIntPipe параметров, файл
 * отдаётся с диска временного storage. Репозиторий — в памяти.
 */

import { readFileSync } from 'fs';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type {
    RequestBodyObject,
    ResponseObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    PROVIDER_IMAGE_MAX_BYTES,
    PROVIDER_IMAGE_MESSAGES,
    ProviderImageRepository,
    ProviderImageService,
    ProviderImageStorage,
} from '../provider-image';
import { MemoryProviderImageRepository } from '../provider-image/__tests__/memory-provider-image.repository';
import {
    createTempStorage,
    fakeHtml,
    makeInterlacedPng,
    makePng,
    TempStorage,
} from '../provider-image/__tests__/support/image-fixtures';
import { ProviderImageAdminController } from './provider-image.admin.controller';
import type { ProviderImageResponseDto } from './provider-image.dto';

const RQ = 15;
const BASE = `/admin/portal/provider/rq/${RQ}/images`;

const messageOf = (res: request.Response): string =>
    (res.body as { message: string }).message;

describe('админ-ручки картинок поставщика', () => {
    let temp: TempStorage;
    let app: INestApplication<App>;

    beforeEach(async () => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        temp = createTempStorage();
        const moduleRef = await Test.createTestingModule({
            controllers: [ProviderImageAdminController],
            providers: [
                ProviderImageService,
                { provide: ProviderImageStorage, useValue: temp.storage },
                {
                    provide: ProviderImageRepository,
                    useValue: new MemoryProviderImageRepository([RQ]),
                },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();
    });

    afterEach(async () => {
        await app.close();
        temp.cleanup();
        jest.restoreAllMocks();
    });

    const put = (role: string, buffer: Buffer, filename = 'pechat.png') =>
        request(app.getHttpServer())
            .put(`${BASE}/${role}`)
            .attach('file', buffer, filename);

    it('загрузка → список → файл для превью → удаление', async () => {
        // чересстрочный PNG: после загрузки хранится обычный, с его размером в записи
        const source = await makeInterlacedPng(120, 80);

        const uploaded = (await put('stamp', source).expect(200))
            .body as ProviderImageResponseDto;
        expect(uploaded).toMatchObject({
            rqId: RQ,
            role: 'stamp',
            format: 'png',
            width: 120,
            height: 80,
            originalName: 'pechat.png',
        });
        const stored = readFileSync(
            temp.fullPath(
                `konstructor/provider-images/${RQ}/${uploaded.id}.png`,
            ),
        );
        expect(uploaded.size).toBe(stored.length);
        expect((await sharp(stored).metadata()).isProgressive).toBe(false);
        expect(uploaded).not.toHaveProperty('path');

        const list = (await request(app.getHttpServer()).get(BASE).expect(200))
            .body as ProviderImageResponseDto[];
        expect(list.map(image => image.role)).toEqual(['stamp']);
        expect(list[0].id).toBe(uploaded.id);

        const file = await request(app.getHttpServer())
            .get(`${BASE}/stamp/file`)
            .buffer(true)
            .parse((res, done) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => done(null, Buffer.concat(chunks)));
            })
            .expect(200);
        expect(file.headers['content-type']).toBe('image/png');
        expect(file.headers['cache-control']).toBe('private, no-store');
        expect(file.headers['x-content-type-options']).toBe('nosniff');
        expect((file.body as Buffer).equals(stored)).toBe(true);

        await request(app.getHttpServer()).delete(`${BASE}/stamp`).expect(204);
        await request(app.getHttpServer())
            .get(`${BASE}/stamp/file`)
            .expect(404);
        await request(app.getHttpServer()).delete(`${BASE}/stamp`).expect(404);
    });

    it('замена картинки той же роли отдаёт новую запись, в списке одна', async () => {
        const first = (await put('logo', await makePng(10, 10)).expect(200))
            .body as ProviderImageResponseDto;
        const second = (await put('logo', await makePng(30, 30)).expect(200))
            .body as ProviderImageResponseDto;

        expect(second.id).not.toBe(first.id);
        const list = (await request(app.getHttpServer()).get(BASE).expect(200))
            .body as ProviderImageResponseDto[];
        expect(list).toHaveLength(1);
        expect(list[0].width).toBe(30);
    });

    it('неизвестная роль — 400 с текстом по-русски на всех ручках с ролью', async () => {
        const png = await makePng();
        const res = await put('seal', png).expect(400);
        expect(messageOf(res)).toBe(
            PROVIDER_IMAGE_MESSAGES.unknownRole('seal'),
        );

        await request(app.getHttpServer()).get(`${BASE}/seal/file`).expect(400);
        await request(app.getHttpServer()).delete(`${BASE}/seal`).expect(400);
    });

    it('файл больше 2 МБ — 400 с текстом по-русски', async () => {
        const huge = Buffer.concat([
            await makePng(),
            Buffer.alloc(PROVIDER_IMAGE_MAX_BYTES, 0),
        ]);
        const res = await put('stamp', huge).expect(400);
        expect(messageOf(res)).toBe(PROVIDER_IMAGE_MESSAGES.tooLarge);
    });

    it('чужой формат — 400', async () => {
        const res = await put('stamp', fakeHtml(), 'pechat.png').expect(400);
        expect(messageOf(res)).toBe(PROVIDER_IMAGE_MESSAGES.unsupportedFormat);
    });

    it('запрос без файла — 400', async () => {
        const res = await request(app.getHttpServer())
            .put(`${BASE}/stamp`)
            .field('comment', 'без файла')
            .expect(400);
        expect(messageOf(res)).toBe(PROVIDER_IMAGE_MESSAGES.noFile);
    });

    it('файл в чужом поле — 400 с русским текстом', async () => {
        const res = await request(app.getHttpServer())
            .put(`${BASE}/stamp`)
            .attach('image', await makePng(), 'pechat.png')
            .expect(400);
        expect(messageOf(res)).toBe(PROVIDER_IMAGE_MESSAGES.badUpload);
    });

    it('реквизитов нет — 404; id не числом — 400', async () => {
        await request(app.getHttpServer())
            .put('/admin/portal/provider/rq/999/images/stamp')
            .attach('file', await makePng(), 'pechat.png')
            .expect(404);
        await request(app.getHttpServer())
            .get('/admin/portal/provider/rq/999/images')
            .expect(404);
        await request(app.getHttpServer())
            .get('/admin/portal/provider/rq/abc/images')
            .expect(400);
    });

    it('список без картинок пуст', async () => {
        const list = (await request(app.getHttpServer()).get(BASE).expect(200))
            .body as ProviderImageResponseDto[];
        expect(list).toEqual([]);
    });

    it('Swagger описывает четыре ручки: роль — перечисление, загрузка — multipart с полем file', () => {
        const document = SwaggerModule.createDocument(
            app,
            new DocumentBuilder().build(),
            {
                operationIdFactory: (
                    controllerKey: string,
                    methodKey: string,
                ) =>
                    `${controllerKey.replace(/Controller$/i, '')}_${methodKey}`,
            },
        );
        const list = document.paths['/admin/portal/provider/rq/{rqId}/images'];
        const byRole =
            document.paths['/admin/portal/provider/rq/{rqId}/images/{role}'];
        const file =
            document.paths[
                '/admin/portal/provider/rq/{rqId}/images/{role}/file'
            ];

        expect(list.get?.operationId).toBe('ProviderImageAdmin_listImages');
        expect(byRole.put?.operationId).toBe('ProviderImageAdmin_uploadImage');
        expect(byRole.delete?.operationId).toBe(
            'ProviderImageAdmin_removeImage',
        );
        expect(file.get?.operationId).toBe('ProviderImageAdmin_getImageFile');

        const body = byRole.put?.requestBody as RequestBodyObject | undefined;
        expect(Object.keys(body?.content ?? {})).toEqual([
            'multipart/form-data',
        ]);
        const ok = file.get?.responses['200'] as ResponseObject | undefined;
        expect(Object.keys(ok?.content ?? {})).toEqual([
            'image/png',
            'image/jpeg',
        ]);
        expect(Object.keys(byRole.delete?.responses ?? {})).toContain('204');

        const roleParam = (byRole.put?.parameters ?? []).find(
            parameter => 'name' in parameter && parameter.name === 'role',
        );
        expect(roleParam).toMatchObject({
            in: 'path',
            required: true,
            schema: { $ref: '#/components/schemas/ProviderImageRole' },
        });
        expect(document.components?.schemas?.ProviderImageRole).toMatchObject({
            enum: [
                'stamp',
                'signature_director',
                'signature_accountant',
                'logo',
            ],
        });
        expect(document.components?.schemas).toHaveProperty(
            'ProviderImageResponseDto',
        );
        expect(document.components?.schemas).toHaveProperty(
            'ProviderImageUploadDto',
        );
    });
});
