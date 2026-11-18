/**
 * Ручки статей на настоящем Nest-приложении: глобальный ValidationPipe ровно
 * как в bootstrapApp (whitelist + enableImplicitConversion — блоки и
 * свойства не должны исказиться), «база» — в памяти. Админка и сайт —
 * в одном приложении теста, чтобы пройти путь «правка → публикация → сайт».
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
    type TempStorage,
} from '../../media/__tests__/support/media-fixtures';
import { SiteMediaLibraryRepository } from '../../library/site-media-library.repository';
import { SITE_ARTICLE_MESSAGES } from '../domain/site-article.messages';
import type {
    SiteArticleSavedDto,
    SiteArticleCardDto,
} from '../dto/site-article-revision-view.dto';
import type {
    SiteArticleDto,
    SiteArticleEnsureResultDto,
} from '../dto/site-article-view.dto';
import type {
    SiteArticlePublicDto,
    SiteArticlePublicListDto,
} from '../dto/site-article-public.dto';
import { SiteArticleMediaLinkRepository } from '../repositories/site-article-media-link.repository';
import { SiteArticleRepository } from '../repositories/site-article.repository';
import { SiteArticleRevisionRepository } from '../repositories/site-article-revision.repository';
import { SiteArticlesAdminModule } from '../site-articles-admin.module';
import { SiteArticlesPublicModule } from '../site-articles-public.module';
import {
    InMemoryArticleRepository,
    InMemoryArticleStore,
    InMemoryMediaLinkRepository,
    InMemoryRevisionRepository,
} from './support/in-memory-articles';

const ADMIN = '/admin/site-articles';
const body = <T>(res: request.Response): T => res.body as T;

/** Блоки со вложенными списками и объектами — их не должен испортить ValidationPipe. */
const RICH_BLOCKS = [
    { kind: 'lead', text: 'Подводка' },
    {
        kind: 'table',
        head: ['Поле', 'Значение'],
        rows: [
            ['a', 'b'],
            ['c', 'd'],
        ],
    },
    {
        kind: 'steps',
        items: [{ title: 'Шаг', text: 'Сделать', screen: { label: 'x' } }],
    },
    {
        kind: 'discourse',
        question: 'Кто решает?',
        positions: [{ who: 'РОП', text: 'Я' }],
        price: 'Спор',
        preview: { stages: ['a', 'b'], flags: { on: true, level: 2 } },
    },
    { kind: 'media', slot: 'scr-kpi' },
];

describe('ручки статей сайта', () => {
    let temp: TempStorage;
    let store: InMemoryArticleStore;
    let app: INestApplication<App>;

    beforeEach(async () => {
        temp = createTempStorage();
        store = new InMemoryArticleStore();
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
                SiteArticlesAdminModule,
                SiteArticlesPublicModule,
            ],
        })
            .overrideProvider(ConfigService)
            .useValue(temp.config)
            .overrideProvider(PrismaService)
            .useValue({})
            .overrideProvider(SiteArticleRepository)
            .useValue(new InMemoryArticleRepository(store))
            .overrideProvider(SiteArticleRevisionRepository)
            .useValue(new InMemoryRevisionRepository(store))
            .overrideProvider(SiteArticleMediaLinkRepository)
            .useValue(new InMemoryMediaLinkRepository(store))
            .overrideProvider(SiteMediaLibraryRepository)
            .useValue(store.media)
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

    it('статья: создать → черновик → опубликовать → сайт видит текст как есть', async () => {
        const meta = {
            tags: ['kpi', 'роп'],
            audience: { role: 'rop', level: 2 },
        };
        const article = body<SiteArticleDto>(
            await request(server())
                .post(ADMIN)
                .send({
                    section: 'articles',
                    type: 'news',
                    slug: 'news/kpi',
                    meta,
                })
                .expect(200),
        );
        expect(article).toMatchObject({ status: 'draft', meta });

        const saved = body<SiteArticleSavedDto>(
            await request(server())
                .put(`${ADMIN}/${article.id}/draft`)
                .send({ expectedNumber: 0, title: 'KPI', blocks: RICH_BLOCKS })
                .expect(200),
        );
        expect(saved.revision.blocks).toEqual(RICH_BLOCKS);
        expect(saved.article.state).toEqual({
            latestNumber: 1,
            publishedNumber: null,
            hasDraft: true,
        });

        const card = body<SiteArticleCardDto>(
            await request(server()).get(`${ADMIN}/${article.id}`).expect(200),
        );
        expect(card.latest?.blocks).toEqual(RICH_BLOCKS);

        await request(server())
            .post(`${ADMIN}/${article.id}/publish`)
            .send({ revisionId: saved.revision.id })
            .expect(200);

        const page = body<SiteArticlePublicDto>(
            await request(server())
                .get('/site-articles/articles/article?slug=news/kpi')
                .expect(200),
        );
        expect(page.content?.blocks).toEqual(RICH_BLOCKS);
        expect(page).toMatchObject({ type: 'news', meta });
        expect(typeof page.publishedAt).toBe('string');

        const list = body<SiteArticlePublicListDto>(
            await request(server()).get('/site-articles/articles').expect(200),
        );
        expect(list.items.map(item => item.slug)).toEqual(['news/kpi']);
    });

    it('устаревший expectedNumber — 409 с понятным текстом', async () => {
        const { article } = body<SiteArticleEnsureResultDto>(
            await request(server())
                .post(`${ADMIN}/ensure`)
                .send({ section: 'ai', slug: '' })
                .expect(200),
        );
        const draft = {
            expectedNumber: 0,
            title: 'T',
            blocks: [{ kind: 'lead', text: 'x' }],
        };
        await request(server())
            .put(`${ADMIN}/${article.id}/draft`)
            .send(draft)
            .expect(200);
        const conflict = await request(server())
            .put(`${ADMIN}/${article.id}/draft`)
            .send(draft)
            .expect(409);
        expect(conflict.text).toContain(SITE_ARTICLE_MESSAGES.versionConflict);
    });

    it('кривые блоки — 400 со списком проблем', async () => {
        const { article } = body<SiteArticleEnsureResultDto>(
            await request(server())
                .post(`${ADMIN}/ensure`)
                .send({ section: 'ai', slug: 'x' })
                .expect(200),
        );
        const res = await request(server())
            .put(`${ADMIN}/${article.id}/draft`)
            .send({
                expectedNumber: 0,
                title: 'T',
                blocks: [{ kind: 'note', text: 'x' }],
            })
            .expect(400);
        expect(body<{ message: string[] }>(res).message).toEqual([
            SITE_ARTICLE_MESSAGES.blocksInvalid,
            'Блок 1 (note): поле «tone» — одно из: good, warn, bad, neutral',
        ]);
        await request(server())
            .put(`${ADMIN}/${article.id}/draft`)
            .send({ expectedNumber: 0, title: 'T', blocks: 'текст' })
            .expect(400);
    });

    it('глава из кода: медиа места видно на сайте без публикации текста', async () => {
        const { article } = body<SiteArticleEnsureResultDto>(
            await request(server())
                .post(`${ADMIN}/ensure`)
                .send({ section: 'ai', slug: 'theory/kpi' })
                .expect(200),
        );
        const mediaId = '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69';
        store.media.rows.set(mediaId, {
            id: mediaId,
            kind: 'image',
            title: 'служебное',
            caption: 'Подпись',
            alt: 'alt',
            fileName: `${mediaId}.0123456789ab.webp`,
            darkFileName: null,
            posterFileName: null,
            mime: 'image/webp',
            sizeBytes: 1,
            width: 10,
            height: 10,
            durationSec: null,
            embedProvider: null,
            embedUrl: null,
            embedId: null,
            uploadedBy: 'admin',
            createdAt: null,
            updatedAt: null,
            usageCount: 0,
        });
        await request(server())
            .put(`${ADMIN}/${article.id}/media`)
            .send({ role: 'inline', slot: 'scr-kpi', mediaId })
            .expect(200);
        const page = body<SiteArticlePublicDto>(
            await request(server())
                .get('/site-articles/ai/article?slug=theory/kpi')
                .expect(200),
        );
        expect(page.content).toBeNull();
        expect(page.media.slots['scr-kpi']).toMatchObject({
            url: `/media/library/${mediaId}.0123456789ab.webp`,
            caption: 'Подпись',
        });
        expect(JSON.stringify(page)).not.toContain('служебное');
    });

    it('проверка ввода: раздел, uuid, роль; открытая статья без публикации — 404', async () => {
        await request(server())
            .post(ADMIN)
            .send({ section: 'blog', type: 'news', slug: 'a' })
            .expect(400);
        await request(server()).get(`${ADMIN}/not-a-uuid`).expect(400);
        await request(server()).get(`${ADMIN}?status=hidden`).expect(400);
        await request(server()).get('/site-articles/blog').expect(400);
        await request(server())
            .get('/site-articles/articles/article?slug=nope')
            .expect(404);
        await request(server()).get('/site-articles/ai/article').expect(200);
    });

    it('миграция не применена: админке — 503, сайту — текст из кода', async () => {
        store.tablesMissing = true;
        const res = await request(server()).get(ADMIN).expect(503);
        expect(res.text).toContain('миграция базы не применена');
        const page = body<SiteArticlePublicDto>(
            await request(server())
                .get('/site-articles/ai/article?slug=theory/kpi')
                .expect(200),
        );
        expect(page.content).toBeNull();
        await request(server())
            .get('/site-articles/articles')
            .expect(200, { items: [] });
    });
});
