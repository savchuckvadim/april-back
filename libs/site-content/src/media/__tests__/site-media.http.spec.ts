/**
 * Обе ручки на настоящем Nest-приложении: multipart через multer, валидация
 * параметров глобальным ValidationPipe (как в bootstrapApp), отдача файла
 * express sendFile — Range для перемотки видео и вечный кеш.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SITE_MEDIA_CACHE_MAX_AGE_MS } from '../controllers/site-media.public.controller';
import type { SiteMediaItemDto, SiteMediaListDto } from '../dto/site-media.dto';
import { SiteMediaAdminModule } from '../site-media-admin.module';
import { SiteMediaPublicModule } from '../site-media-public.module';
import {
    createTempStorage,
    fakeHtml,
    fakeJpg,
    fakeMp4,
    fakePng,
    type TempStorage,
} from './support/media-fixtures';

/** Ответы ручек — DTO контроллеров (без конверта: интерсептор приложения тут не подключён). */
const itemOf = (res: request.Response): SiteMediaItemDto =>
    res.body as SiteMediaItemDto;
const listOf = (res: request.Response): SiteMediaListDto =>
    res.body as SiteMediaListDto;

describe('ручки картинок и видео сайта', () => {
    let temp: TempStorage;
    let app: INestApplication<App>;

    beforeEach(async () => {
        temp = createTempStorage();
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
                SiteMediaAdminModule,
                SiteMediaPublicModule,
            ],
        })
            .overrideProvider(ConfigService)
            .useValue(temp.config)
            .compile();
        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();
    });

    afterEach(async () => {
        await app.close();
        temp.cleanup();
    });

    const upload = (slot: string, parts: Record<string, Buffer>) => {
        const req = request(app.getHttpServer()).put(
            `/admin/site-media/platform/${slot}`,
        );
        for (const [field, buffer] of Object.entries(parts)) {
            req.attach(field, buffer, `${field}.bin`);
        }
        return req;
    };

    it('загрузка в админке → список и файл для сайта', async () => {
        const png = fakePng();
        const uploaded = itemOf(
            await upload('calls-form', { file: png }).expect(200),
        );
        expect(uploaded).toMatchObject({ slot: 'calls-form', kind: 'image' });

        const list = listOf(
            await request(app.getHttpServer())
                .get('/site-media/platform')
                .expect(200),
        );
        expect(list.items).toEqual([uploaded]);

        const file = await request(app.getHttpServer())
            .get(`/site-media/platform/files/${uploaded.file}`)
            .expect(200);
        expect(file.headers['content-type']).toBe('image/png');
        expect(file.headers['x-content-type-options']).toBe('nosniff');
        expect(file.headers['cache-control']).toBe(
            `public, max-age=${SITE_MEDIA_CACHE_MAX_AGE_MS / 1000}, immutable`,
        );
        expect(Buffer.compare(file.body as Buffer, png)).toBe(0);
    });

    it('видео отдаётся кусками по Range — перемотка работает', async () => {
        const video = itemOf(
            await upload('hub-overview', {
                file: fakeMp4('v', 64),
                poster: fakeJpg(),
            }).expect(200),
        );
        expect(video.poster).toMatch(/^hub-overview\.poster\./);

        const part = await request(app.getHttpServer())
            .get(`/site-media/platform/files/${video.file}`)
            .set('Range', 'bytes=0-9')
            .expect(206);
        expect(part.headers['content-range']).toBe('bytes 0-9/64');
        expect(part.headers['content-type']).toBe('video/mp4');
        expect(part.headers['accept-ranges']).toBe('bytes');
    });

    it('чужое или удалённое имя файла — 404, кривой раздел — 400', async () => {
        await request(app.getHttpServer())
            .get('/site-media/platform/files/calls-form.0123456789ab.png')
            .expect(404);
        await request(app.getHttpServer())
            .get('/site-media/platform/files/secret.txt')
            .expect(400);
        await request(app.getHttpServer())
            .get('/site-media/Platform')
            .expect(400);
    });

    it('HTML вместо картинки — 400, на диск ничего не попало', async () => {
        await upload('calls-form', { file: fakeHtml() }).expect(400);
        const list = listOf(
            await request(app.getHttpServer())
                .get('/site-media/platform')
                .expect(200),
        );
        expect(list.items).toEqual([]);
    });

    it('снять постер и удалить кадр', async () => {
        await upload('hub-overview', {
            file: fakeMp4(),
            poster: fakeJpg(),
        }).expect(200);

        const withoutPoster = itemOf(
            await request(app.getHttpServer())
                .delete('/admin/site-media/platform/hub-overview/poster')
                .expect(200),
        );
        expect(withoutPoster.poster).toBeUndefined();

        await request(app.getHttpServer())
            .delete('/admin/site-media/platform/hub-overview')
            .expect(200, { deleted: true });
        await request(app.getHttpServer())
            .delete('/admin/site-media/platform/hub-overview')
            .expect(404);
    });
});
