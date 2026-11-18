import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { SiteMediaLibraryModule } from '../library/site-media-library.module';
import { SiteArticleMediaLinkPrismaRepository } from './repositories/site-article-media-link.prisma.repository';
import { SiteArticleMediaLinkRepository } from './repositories/site-article-media-link.repository';
import { SiteArticlePrismaRepository } from './repositories/site-article.prisma.repository';
import { SiteArticleRepository } from './repositories/site-article.repository';
import { SiteArticleRevisionPrismaRepository } from './repositories/site-article-revision.prisma.repository';
import { SiteArticleRevisionRepository } from './repositories/site-article-revision.repository';
import { SiteArticleDraftsService } from './services/site-article-drafts.service';
import { SiteArticleMediaService } from './services/site-article-media.service';
import { SiteArticlePublishingService } from './services/site-article-publishing.service';
import { SiteArticlesReaderService } from './services/site-articles-reader.service';
import { SiteArticlesService } from './services/site-articles.service';

/**
 * Статьи сайта — только сервисы, без контроллеров. Импортируют:
 * - SiteArticlesAdminModule — редактор статей (только apps/admin);
 * - SiteArticlesPublicModule — чтение опубликованного сайтом (apps/bot).
 *
 * PrismaModule импортируем сами (он @Global, но включается только после
 * первого импорта), медиатеку — ради связей статей с медиа.
 */
@Module({
    imports: [PrismaModule, SiteMediaLibraryModule],
    providers: [
        {
            provide: SiteArticleRepository,
            useClass: SiteArticlePrismaRepository,
        },
        {
            provide: SiteArticleRevisionRepository,
            useClass: SiteArticleRevisionPrismaRepository,
        },
        {
            provide: SiteArticleMediaLinkRepository,
            useClass: SiteArticleMediaLinkPrismaRepository,
        },
        SiteArticlesService,
        SiteArticleDraftsService,
        SiteArticlePublishingService,
        SiteArticleMediaService,
        SiteArticlesReaderService,
    ],
    exports: [
        SiteArticlesService,
        SiteArticleDraftsService,
        SiteArticlePublishingService,
        SiteArticleMediaService,
        SiteArticlesReaderService,
    ],
})
export class SiteArticlesModule {}
