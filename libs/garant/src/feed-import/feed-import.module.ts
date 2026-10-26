import { Module } from '@nestjs/common';
import { RegionModule } from '../region/region.module';
import { PriceModule } from '../price/price.module';
import { ComplectModule } from '../complect';
import { SupplyModule } from '../supply';
import { PackageModule } from '../package';
import { GarantFeedClientService } from './services/garant-feed-client.service';
import { GarantFeedRegionImportService } from './services/garant-feed-region-import.service';
import { GarantFeedPriceImportService } from './services/garant-feed-price-import.service';
import { GarantFeedSeedService } from './services/garant-feed-seed.service';
import { GarantFeedImportService } from './services/garant-feed-import.service';

/**
 * Сервисный модуль импорта каталога из Google-фида цен.
 * Контроллер — в {@link GarantFeedImportAdminModule} (только apps/admin),
 * чтобы роуты импорта не торчали в Swagger других приложений.
 */
@Module({
    imports: [
        RegionModule,
        PriceModule,
        ComplectModule,
        SupplyModule,
        PackageModule,
    ],
    providers: [
        GarantFeedClientService,
        GarantFeedRegionImportService,
        GarantFeedPriceImportService,
        GarantFeedSeedService,
        GarantFeedImportService,
    ],
    exports: [GarantFeedImportService],
})
export class GarantFeedImportModule {}
