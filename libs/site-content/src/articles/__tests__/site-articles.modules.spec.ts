import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { Role } from '@lib/auth';
import { ROLES_KEY } from '@lib/auth/config/auth.constants';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { findMissingDependenciesDeep } from '@lib/core/testing/module-di-deep';
import {
    createTempStorage,
    type TempStorage,
} from '../../media/__tests__/support/media-fixtures';
import { SiteMediaPublicModule } from '../../media/site-media-public.module';
import { SiteArticleDraftsAdminController } from '../controllers/site-article-drafts.admin.controller';
import { SiteArticleMediaAdminController } from '../controllers/site-article-media.admin.controller';
import { SiteArticlePublishingAdminController } from '../controllers/site-article-publishing.admin.controller';
import { SiteArticlesAdminController } from '../controllers/site-articles.admin.controller';
import { SiteArticlesPublicController } from '../controllers/site-articles.public.controller';
import { SiteArticlesAdminModule } from '../site-articles-admin.module';
import { SiteArticlesModule } from '../site-articles.module';
import { SiteArticlesPublicModule } from '../site-articles-public.module';

const ADMIN_CONTROLLERS = [
    SiteArticlesAdminController,
    SiteArticleDraftsAdminController,
    SiteArticlePublishingAdminController,
    SiteArticleMediaAdminController,
];

const controllersOf = (module: object): unknown[] => {
    const list: unknown = Reflect.getMetadata('controllers', module);
    return Array.isArray(list) ? list : [];
};

/**
 * Модули статей: DI-граф целиком (UnknownDependenciesException сборка не
 * ловит), раскол по ai/rules/app-api-surface.md, права и то, что Swagger
 * сайта (apps/bot) не получает ни одной админской ручки.
 */
describe('модули статей сайта', () => {
    it.each([
        ['SiteArticlesModule', SiteArticlesModule],
        ['SiteArticlesAdminModule (admin)', SiteArticlesAdminModule],
        ['SiteArticlesPublicModule (bot)', SiteArticlesPublicModule],
    ])('%s: все зависимости доступны', (_name, module) => {
        expect(findMissingDependenciesDeep(module, [ConfigService])).toEqual(
            [],
        );
    });

    it('сервисный модуль без контроллеров, админский и публичный — каждый свои', () => {
        expect(controllersOf(SiteArticlesModule)).toEqual([]);
        expect(controllersOf(SiteArticlesAdminModule)).toEqual(
            ADMIN_CONTROLLERS,
        );
        expect(controllersOf(SiteArticlesPublicModule)).toEqual([
            SiteArticlesPublicController,
        ]);
    });

    it.each(ADMIN_CONTROLLERS)('%p — только суперпользователь', controller => {
        expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual([
            Role.SUPER_USER,
        ]);
    });

    it('публичная ручка открыта: ролей нет', () => {
        expect(
            Reflect.getMetadata(ROLES_KEY, SiteArticlesPublicController),
        ).toBeUndefined();
    });

    describe('Swagger приложения сайта (как в apps/bot)', () => {
        let temp: TempStorage;
        let app: INestApplication;

        beforeEach(async () => {
            temp = createTempStorage();
            const moduleRef = await Test.createTestingModule({
                imports: [
                    ConfigModule.forRoot({
                        isGlobal: true,
                        ignoreEnvFile: true,
                    }),
                    SiteMediaPublicModule,
                    SiteArticlesPublicModule,
                ],
            })
                .overrideProvider(ConfigService)
                .useValue(temp.config)
                .overrideProvider(PrismaService)
                .useValue({})
                .compile();
            app = moduleRef.createNestApplication();
            await app.init();
        });

        afterEach(async () => {
            await app.close();
            temp.cleanup();
        });

        it('только чтение для сайта, ни одного пути admin/', () => {
            const document = SwaggerModule.createDocument(
                app,
                new DocumentBuilder().build(),
            );
            const paths = Object.keys(document.paths).sort();
            expect(paths.filter(path => path.includes('admin'))).toEqual([]);
            expect(paths).toEqual(
                expect.arrayContaining([
                    '/site-articles/{section}',
                    '/site-articles/{section}/article',
                    '/site-media/{section}',
                    '/site-media/{section}/files/{file}',
                ]),
            );
            const methods = Object.values(document.paths).flatMap(item =>
                Object.keys(item),
            );
            expect(new Set(methods)).toEqual(new Set(['get']));
        });
    });
});
