import { Module } from '@nestjs/common';
import { StorageModule } from '@lib/core/storage';
import { SiteMediaService } from './site-media.service';
import { SiteMediaStorage } from './site-media.storage';

/**
 * Картинки и видео сайта — только сервисы, без контроллеров. Его импортируют:
 *
 * - SiteMediaAdminModule — загрузка, замена, удаление (только apps/admin);
 * - SiteMediaPublicModule — список и файлы для сайта (apps/bot).
 *
 * Раскол — чтобы контроллеры не протекали в Swagger чужих приложений
 * (ai/rules/app-api-surface.md). StorageModule импортируем сами: он
 * @Global, но регистрирует провайдеры, только когда его кто-то импортировал.
 */
@Module({
    imports: [StorageModule],
    providers: [SiteMediaStorage, SiteMediaService],
    exports: [SiteMediaService],
})
export class SiteMediaModule {}
