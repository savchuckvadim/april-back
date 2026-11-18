import { Module } from '@nestjs/common';
import { SiteArticlesPublicController } from './controllers/site-articles.public.controller';
import { SiteArticlesModule } from './site-articles.module';

/**
 * Опубликованные статьи для сайта April: перечень раздела и статья с медиа.
 * Подключается в apps/bot — рядом с SiteMediaPublicModule (файлы медиатеки
 * сайт берёт там же: GET site-media/library/files/<имя>).
 */
@Module({
    imports: [SiteArticlesModule],
    controllers: [SiteArticlesPublicController],
})
export class SiteArticlesPublicModule {}
