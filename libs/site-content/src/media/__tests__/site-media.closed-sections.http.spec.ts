/**
 * Закрытые разделы старых ручек кадров (медиатека статей, раздел library):
 * перечень наружу не отдаётся, загрузка и удаление через admin/site-media —
 * отказ; файлы по адресу …/files/<имя> отдаются как прежде. Для остальных
 * разделов (platform) поведение не меняется.
 */

import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createGlobalValidationPipe } from '@lib/core/bootstrap/global-validation-pipe';
import {
    SITE_MEDIA_CLOSED_SECTION_MESSAGES,
    SITE_MEDIA_CLOSED_SECTIONS,
    SITE_MEDIA_LIBRARY_SECTION,
} from '../domain/site-media.sections';
import type { SiteMediaItemDto, SiteMediaListDto } from '../dto/site-media.dto';
import { SiteMediaAdminModule } from '../site-media-admin.module';
import { SiteMediaPublicModule } from '../site-media-public.module';
import { SiteMediaService } from '../site-media.service';
import {
    createTempStorage,
    fakeJpg,
    fakeMp4,
    fakePng,
    type TempStorage,
} from './support/media-fixtures';

const LIBRARY_ID = '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69';

describe('закрытые разделы старых ручек картинок сайта', () => {
    let temp: TempStorage;
    let app: INestApplication<App>;
    let media: SiteMediaService;

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
        app.useGlobalPipes(createGlobalValidationPipe());
        await app.init();
        media = moduleRef.get(SiteMediaService);
    });

    afterEach(async () => {
        await app.close();
        temp.cleanup();
    });

    const server = () => app.getHttpServer();

    it('закрыт ровно раздел медиатеки', () => {
        expect(SITE_MEDIA_CLOSED_SECTIONS).toEqual([
            SITE_MEDIA_LIBRARY_SECTION,
        ]);
    });

    describe('раздел library', () => {
        let file: string;
        let poster: string | undefined;

        beforeEach(async () => {
            const item = await media.put(
                SITE_MEDIA_LIBRARY_SECTION,
                LIBRARY_ID,
                {
                    file: { buffer: fakeMp4() },
                    poster: { buffer: fakeJpg() },
                },
            );
            file = item.file;
            poster = item.poster;
        });

        it('перечень наружу — 404, файлы по имени — отдаются', async () => {
            const res = await request(server())
                .get('/site-media/library')
                .expect(404);
            expect(res.text).toContain(
                SITE_MEDIA_CLOSED_SECTION_MESSAGES.publicList,
            );
            await request(server())
                .get(`/site-media/library/files/${file}`)
                .expect(200);
            await request(server())
                .get(`/site-media/library/files/${poster}`)
                .expect(200);
        });

        it.each([
            [
                'PUT',
                () =>
                    request(server())
                        .put(`/admin/site-media/library/${LIBRARY_ID}`)
                        .attach('file', fakePng(), 'f.bin'),
            ],
            [
                'DELETE постера',
                () =>
                    request(server()).delete(
                        `/admin/site-media/library/${LIBRARY_ID}/poster`,
                    ),
            ],
            [
                'DELETE',
                () =>
                    request(server()).delete(
                        `/admin/site-media/library/${LIBRARY_ID}`,
                    ),
            ],
        ])(
            '%s через старую админскую ручку — отказ, файлы целы',
            async (_name, call) => {
                const res = await call().expect(403);
                expect(res.text).toContain(
                    SITE_MEDIA_CLOSED_SECTION_MESSAGES.admin,
                );
                const left = await media.list(SITE_MEDIA_LIBRARY_SECTION);
                expect(left).toEqual([
                    expect.objectContaining({ slot: LIBRARY_ID, file, poster }),
                ]);
            },
        );
    });

    describe('раздел platform — как раньше', () => {
        it('перечень, загрузка, постер, удаление', async () => {
            const video = (
                await request(server())
                    .put('/admin/site-media/platform/hub-overview')
                    .attach('file', fakeMp4(), 'file.bin')
                    .attach('poster', fakeJpg(), 'poster.bin')
                    .expect(200)
            ).body as SiteMediaItemDto;
            const list = (
                await request(server()).get('/site-media/platform').expect(200)
            ).body as SiteMediaListDto;
            expect(list.items).toEqual([video]);
            await request(server())
                .delete('/admin/site-media/platform/hub-overview/poster')
                .expect(200);
            await request(server())
                .delete('/admin/site-media/platform/hub-overview')
                .expect(200, { deleted: true });
        });

        it('похожий, но открытый раздел не закрыт', async () => {
            await request(server())
                .put('/admin/site-media/library-2/calls-form')
                .attach('file', fakePng(), 'file.bin')
                .expect(200);
            await request(server()).get('/site-media/library-2').expect(200);
        });
    });
});
