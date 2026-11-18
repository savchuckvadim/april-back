/**
 * Ручки медиатеки на настоящем Nest-приложении: multipart через multer,
 * глобальный ValidationPipe ровно как в bootstrapApp, файлы — на временном
 * диске, строки — в памяти (базы нет). Заодно — что кадры /platform
 * (SiteMediaAdminModule/SiteMediaPublicModule) работают как раньше, когда
 * рядом подключена медиатека.
 */

import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createGlobalValidationPipe } from '@lib/core/bootstrap/global-validation-pipe';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import {
    createTempStorage,
    fakeMp4,
    fakePng,
    type TempStorage,
} from '../../media/__tests__/support/media-fixtures';
import type {
    SiteMediaItemDto,
    SiteMediaListDto,
} from '../../media/dto/site-media.dto';
import { SiteMediaAdminModule } from '../../media/site-media-admin.module';
import { SiteMediaPublicModule } from '../../media/site-media-public.module';
import type {
    SiteMediaLibraryItemDto,
    SiteMediaLibraryListDto,
} from '../dto/site-media-library-view.dto';
import { SiteMediaLibraryAdminModule } from '../site-media-library-admin.module';
import { SiteMediaLibraryRepository } from '../site-media-library.repository';
import { InMemoryMediaLibraryRepository } from './support/in-memory-media-library.repository';
import { realImage } from './support/library-fixtures';

const PATH = '/admin/site-media-library';

const body = <T>(res: request.Response): T => res.body as T;

describe('ручки медиатеки сайта', () => {
    let temp: TempStorage;
    let app: INestApplication<App>;
    let repository: InMemoryMediaLibraryRepository;
    let png: Buffer;

    beforeAll(async () => {
        png = await realImage(64, 48);
    });

    beforeEach(async () => {
        temp = createTempStorage();
        repository = new InMemoryMediaLibraryRepository();
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
                SiteMediaAdminModule,
                SiteMediaPublicModule,
                SiteMediaLibraryAdminModule,
            ],
        })
            .overrideProvider(ConfigService)
            .useValue(temp.config)
            .overrideProvider(PrismaService)
            .useValue({})
            .overrideProvider(SiteMediaLibraryRepository)
            .useValue(repository)
            .compile();
        app = moduleRef.createNestApplication();
        app.useGlobalPipes(createGlobalValidationPipe());
        await app.init();
    });

    afterEach(async () => {
        await app.close();
        temp.cleanup();
    });

    const server = () => app.getHttpServer();

    it('загрузка → карточка → файл с адреса сайта → правка → удаление', async () => {
        const uploaded = body<SiteMediaLibraryItemDto>(
            await request(server())
                .post(PATH)
                .field('title', 'Пульс')
                .field('alt', 'Таблица')
                .attach('file', png, 'pulse.png')
                .expect(200),
        );
        expect(uploaded).toMatchObject({
            kind: 'image',
            title: 'Пульс',
            width: 64,
            height: 48,
            usageCount: 0,
            url: `/media/library/${uploaded.fileName}`,
        });
        expect(typeof uploaded.createdAt).toBe('string');

        const file = await request(server())
            .get(`/site-media/library/files/${uploaded.fileName}`)
            .expect(200);
        expect(file.headers['content-type']).toBe('image/png');

        const edited = body<SiteMediaLibraryItemDto>(
            await request(server())
                .patch(`${PATH}/${uploaded.id}`)
                .send({ caption: 'Подпись', alt: null })
                .expect(200),
        );
        expect(edited).toMatchObject({ caption: 'Подпись', alt: null });

        await request(server())
            .delete(`${PATH}/${uploaded.id}`)
            .expect(200, { deleted: true });
        await request(server())
            .get(`/site-media/library/files/${uploaded.fileName}`)
            .expect(404);
        await request(server()).get(`${PATH}/${uploaded.id}`).expect(404);
    });

    it('ролик: числа из multipart приходят числами, кривые — 400', async () => {
        const video = body<SiteMediaLibraryItemDto>(
            await request(server())
                .post(PATH)
                .field('width', '1920')
                .field('height', '1080')
                .field('durationSec', '95')
                .attach('file', fakeMp4(), 'clip.mp4')
                .expect(200),
        );
        expect(video).toMatchObject({
            kind: 'video',
            width: 1920,
            height: 1080,
            durationSec: 95,
        });
        await request(server())
            .post(PATH)
            .field('width', '70000')
            .attach('file', fakeMp4(), 'clip.mp4')
            .expect(400);
    });

    it('внешнее видео и замена файла', async () => {
        const embed = body<SiteMediaLibraryItemDto>(
            await request(server())
                .post(`${PATH}/embed`)
                .send({
                    url: 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/',
                })
                .expect(200),
        );
        expect(embed).toMatchObject({ kind: 'embed', embedProvider: 'rutube' });
        await request(server())
            .post(`${PATH}/embed`)
            .send({ url: 'https://example.com' })
            .expect(400);

        const image = body<SiteMediaLibraryItemDto>(
            await request(server())
                .post(PATH)
                .attach('file', png, 'a.png')
                .expect(200),
        );
        const replaced = body<SiteMediaLibraryItemDto>(
            await request(server())
                .put(`${PATH}/${image.id}/file`)
                .attach('file', await realImage(10, 20, 'webp'), 'b.webp')
                .expect(200),
        );
        expect(replaced).toMatchObject({
            mime: 'image/webp',
            width: 10,
            height: 20,
        });
        await request(server()).put(`${PATH}/${image.id}/file`).expect(400);
    });

    it('список: «unused=false» не превращается в true, кривой id — 400', async () => {
        await request(server())
            .post(PATH)
            .attach('file', png, 'a.png')
            .expect(200);
        const id = [...repository.rows.keys()][0];
        repository.usages.set(id, [
            {
                articleId: 'a',
                section: 'ai',
                slug: 'index',
                title: null,
                role: 'cover',
                slot: 'cover',
            },
        ]);
        const all = body<SiteMediaLibraryListDto>(
            await request(server())
                .get(`${PATH}?unused=false&page=1`)
                .expect(200),
        );
        expect(all.total).toBe(1);
        const unused = body<SiteMediaLibraryListDto>(
            await request(server()).get(`${PATH}?unused=true`).expect(200),
        );
        expect(unused.total).toBe(0);
        await request(server()).get(`${PATH}/not-a-uuid`).expect(400);
        await request(server()).get(`${PATH}?kind=gif`).expect(400);
        await request(server()).delete(`${PATH}/${id}`).expect(409);
    });

    it('кадры /platform работают как раньше и не видят медиатеку', async () => {
        await request(server())
            .post(PATH)
            .attach('file', png, 'a.png')
            .expect(200);
        const shot = body<SiteMediaItemDto>(
            await request(server())
                .put('/admin/site-media/platform/calls-form')
                .attach('file', fakePng(), 'file.bin')
                .expect(200),
        );
        expect(shot).toMatchObject({ slot: 'calls-form', kind: 'image' });
        expect(Object.keys(shot).sort()).toEqual(
            ['file', 'kind', 'size', 'slot', 'updatedAt'].sort(),
        );
        const list = body<SiteMediaListDto>(
            await request(server()).get('/site-media/platform').expect(200),
        );
        expect(list.items).toEqual([shot]);
        await request(server())
            .get(`/site-media/platform/files/${shot.file}`)
            .expect(200);
        await request(server())
            .delete('/admin/site-media/platform/calls-form')
            .expect(200, { deleted: true });
    });
});
