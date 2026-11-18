import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { SiteMediaModule } from '../media/site-media.module';
import { SiteMediaLibraryDisk } from './site-media-library.disk';
import { SiteMediaLibraryFilesService } from './site-media-library-files.service';
import { SiteMediaLibraryPrismaRepository } from './site-media-library.prisma.repository';
import { SiteMediaLibraryRepository } from './site-media-library.repository';
import { SiteMediaLibraryService } from './site-media-library.service';

/**
 * Медиатека сайта — только сервисы, без контроллеров. Импортируют:
 * - SiteMediaLibraryAdminModule — ручки медиатеки (только apps/admin);
 * - SiteArticlesModule — связи статей с медиа.
 *
 * Файлы — готовое хранилище картинок сайта (SiteMediaModule, раздел
 * `library`); отдельной публичной ручки не нужно: файлы отдаёт
 * GET site-media/library/files/<имя> в apps/bot.
 *
 * PrismaModule импортируем сами, хотя он @Global: глобальность включается
 * только после первого импорта, а полагаться на чужой — падать в рантайме,
 * если тот модуль уберут (как RenewalOfferModule).
 */
@Module({
    imports: [PrismaModule, SiteMediaModule],
    providers: [
        SiteMediaLibraryDisk,
        {
            provide: SiteMediaLibraryRepository,
            useClass: SiteMediaLibraryPrismaRepository,
        },
        SiteMediaLibraryService,
        SiteMediaLibraryFilesService,
    ],
    exports: [
        SiteMediaLibraryRepository,
        SiteMediaLibraryService,
        SiteMediaLibraryFilesService,
    ],
})
export class SiteMediaLibraryModule {}
