import { Module } from '@nestjs/common';
import { ComplectModule } from '../complect';
import { SupplyModule } from '../supply';
import { PackageModule } from '../package';
import { CatalogSeedService } from './services/catalog-seed.service';

/**
 * Сервисный модуль сида каталога. Контроллер — в
 * {@link CatalogSeedAdminModule} (только apps/admin).
 */
@Module({
    imports: [ComplectModule, SupplyModule, PackageModule],
    providers: [CatalogSeedService],
    exports: [CatalogSeedService],
})
export class CatalogInstallModule {}
