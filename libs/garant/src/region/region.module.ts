import { Module } from '@nestjs/common';
import { RegionPrismaRepository } from './region.prisma.repository';
import { RegionService } from './region.service';
import { RegionRepository } from './region.repository';
import { StorageModule } from 'src/core/storage/storage.module';
import { PortalRegionService } from './portal-region/portal-region.service';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { RabsVatService } from './rabs-vat.service';

/**
 * Сервисный модуль регионов гаранта: провайдеры и экспорт сервисов, без
 * контроллеров. Контроллеры `/region` и `/portal-region/*` вынесены в
 * {@link RegionAdminModule}: через `GarantModule` модуль попадает в
 * публичное приложение konstructor, и контроллеры с записью цен регионов
 * портала открывались там без авторизации.
 */
@Module({
    imports: [StorageModule, PortalStoreModule],
    providers: [
        RegionService,

        PortalRegionService,
        // Коэффициент НДС рабса из настроек вендора (VendorSettingsModule
        // глобальный; без него читается env): общий для выдачи каталога,
        // админских DTO регионов и загрузки книги цен.
        RabsVatService,
        {
            provide: RegionRepository,
            useClass: RegionPrismaRepository,
        },
    ],
    exports: [RegionService, PortalRegionService, RabsVatService],
})
export class RegionModule {}
