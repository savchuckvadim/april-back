import { Module } from '@nestjs/common';
import { SiteArticleDraftsAdminController } from './controllers/site-article-drafts.admin.controller';
import { SiteArticleMediaAdminController } from './controllers/site-article-media.admin.controller';
import { SiteArticlePublishingAdminController } from './controllers/site-article-publishing.admin.controller';
import { SiteArticlesAdminController } from './controllers/site-articles.admin.controller';
import { SiteArticlesModule } from './site-articles.module';

/** Ручки админки «Сайт → Статьи». Импортирует только apps/admin. */
@Module({
    imports: [SiteArticlesModule],
    controllers: [
        SiteArticlesAdminController,
        SiteArticleDraftsAdminController,
        SiteArticlePublishingAdminController,
        SiteArticleMediaAdminController,
    ],
})
export class SiteArticlesAdminModule {}
