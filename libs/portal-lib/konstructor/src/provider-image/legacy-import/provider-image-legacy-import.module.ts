import { Module } from '@nestjs/common';
import { ProviderImageModule } from '../provider-image.module';
import { LegacyRqFilePrismaRepository } from './legacy-rq-file.prisma.repository';
import { LegacyRqFileRepository } from './legacy-rq-file.repository';
import { ProviderImageLegacyImportService } from './provider-image-legacy-import.service';

/**
 * ВРЕМЕННЫЙ модуль переноса картинок поставщика из легаси. Подключается
 * только в `ProviderAdminModule` вместе с контроллером; после переноса
 * удаляется вся папка `legacy-import/` (см. README картинок поставщика).
 */
@Module({
    imports: [ProviderImageModule],
    providers: [
        {
            provide: LegacyRqFileRepository,
            useClass: LegacyRqFilePrismaRepository,
        },
        ProviderImageLegacyImportService,
    ],
    exports: [ProviderImageLegacyImportService],
})
export class ProviderImageLegacyImportModule {}
