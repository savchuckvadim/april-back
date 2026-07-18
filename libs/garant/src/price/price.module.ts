import { Module } from '@nestjs/common';
import { StorageModule } from 'src/core/storage/storage.module';
import { PriceService } from './services/price.service';
import { PriceRepository } from './repositories/price.repository';
import { PricePrismaRepository } from './repositories/price.prisma.repository';
import { PriceInstallService } from './services/install/price.install.service';
import { PriceExcelService } from './services/excel/price-excel.service';
import { PackageModule } from '../package';
import { ServicesPriceService } from './services/packages-prices/services-price.service';
import { ComplectModule } from '../complect';
import { SupplyModule } from '../supply';
import { ServicesPriceExcelParseService } from './services/excel/services-price-excel-parse.service';
import { ComplectExcelService } from './services/complect-prices/complect-excel-service';
import { ComplectPriceExcelParseService } from './services/excel/complect-price-excel-parse.service';

/**
 * Сервисный модуль цен гаранта. Админ-контроллер вынесен в
 * {@link AdminGarantProfPriceModule}, чтобы konstructor (импортит ради
 * PriceService/PriceInstallService) не тащил админские роуты в свой Swagger.
 * PriceExcelService экспортируется — он нужен админ-контроллеру.
 */
@Module({
    imports: [StorageModule, PackageModule, ComplectModule, SupplyModule],
    providers: [
        PriceService,
        PriceInstallService,
        PriceExcelService,
        ServicesPriceService,
        ServicesPriceExcelParseService,
        ComplectExcelService,
        ComplectPriceExcelParseService,

        {
            provide: PriceRepository,
            useClass: PricePrismaRepository,
        },
    ],
    exports: [
        PriceService,
        PriceInstallService,
        ServicesPriceService,
        PriceExcelService,
    ],
})
export class PriceModule {}
