import { Module } from '@nestjs/common';
import { StorageModule } from '@lib/core/storage';
import { ProviderImagePrismaRepository } from './provider-image.prisma.repository';
import { ProviderImageRepository } from './provider-image.repository';
import { ProviderImageService } from './provider-image.service';
import { ProviderImageStorage } from './provider-image.storage';

/**
 * Картинки поставщика (`provider_images`): печать, подписи и логотип реквизитов.
 * Без контроллеров: админ-ручки живут рядом с поставщиками
 * (`ProviderAdminModule`, правило app-api-surface), PDF-КП читает картинки
 * через `ProviderImageService`. StorageModule импортируем сами: он @Global, но
 * регистрирует провайдеры, только когда его кто-то импортировал.
 */
@Module({
    imports: [StorageModule],
    providers: [
        {
            provide: ProviderImageRepository,
            useClass: ProviderImagePrismaRepository,
        },
        ProviderImageStorage,
        ProviderImageService,
    ],
    exports: [ProviderImageRepository, ProviderImageService],
})
export class ProviderImageModule {}
