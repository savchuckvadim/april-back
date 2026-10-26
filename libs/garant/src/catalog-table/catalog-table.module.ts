import { Module } from '@nestjs/common';
import { PriceModule } from '../price/price.module';
import { RegionModule } from '../region/region.module';
import { ComplectModule } from '../complect';
import { SupplyModule } from '../supply';
import { PackageModule } from '../package';
import { PriceTableExportService } from './services/price-table-export.service';
import { PriceTableImportService } from './services/price-table-import.service';
import { RegionTableService } from './services/region-table.service';
import { SupplyTableService } from './services/supply-table.service';
import { ComplectTableService } from './services/complect-table.service';
import { CatalogTableRegistry } from './services/catalog-table.registry';

/**
 * Сервисный модуль эталонных таблиц каталога. Контроллер — в
 * {@link CatalogTableAdminModule} (только apps/admin), чтобы ручки
 * выгрузки/загрузки не торчали в Swagger konstructor и других приложений
 * (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [
        PriceModule,
        RegionModule,
        ComplectModule,
        SupplyModule,
        PackageModule,
    ],
    providers: [
        PriceTableExportService,
        PriceTableImportService,
        RegionTableService,
        SupplyTableService,
        ComplectTableService,
        CatalogTableRegistry,
    ],
    exports: [CatalogTableRegistry],
})
export class CatalogTableModule {}
