import { Module } from '@nestjs/common';
import { SiteMediaAdminController } from './controllers/site-media.admin.controller';
import { SiteMediaModule } from './site-media.module';

/** Ручки админки «Сайт → Картинки и видео». Импортирует только apps/admin. */
@Module({
    imports: [SiteMediaModule],
    controllers: [SiteMediaAdminController],
})
export class SiteMediaAdminModule {}
