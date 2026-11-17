import { Module } from '@nestjs/common';
import { SiteMediaLibraryFilesAdminController } from './controllers/site-media-library-files.admin.controller';
import { SiteMediaLibraryAdminController } from './controllers/site-media-library.admin.controller';
import { SiteMediaLibraryModule } from './site-media-library.module';

/** Ручки админки «Сайт → Медиатека». Импортирует только apps/admin. */
@Module({
    imports: [SiteMediaLibraryModule],
    controllers: [
        SiteMediaLibraryAdminController,
        SiteMediaLibraryFilesAdminController,
    ],
})
export class SiteMediaLibraryAdminModule {}
