import { Module } from '@nestjs/common';
import { SiteMediaPublicController } from './controllers/site-media.public.controller';
import { SiteMediaModule } from './site-media.module';

/**
 * Список и файлы картинок и видео для сайта April. Подключается в apps/bot —
 * тот же бэк, куда сайт шлёт заявки (SiteLeadModule).
 */
@Module({
    imports: [SiteMediaModule],
    controllers: [SiteMediaPublicController],
})
export class SiteMediaPublicModule {}
