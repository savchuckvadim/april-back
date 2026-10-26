import { Module } from '@nestjs/common';
import { PriceService } from './services/price.service';
import { PriceRepository } from './repositories/price.repository';
import { PricePrismaRepository } from './repositories/price.prisma.repository';
import { PackageModule } from '../package';
import { ComplectModule } from '../complect';
import { SupplyModule } from '../supply';

/**
 * Сервисный модуль цен гаранта. Админ-контроллер вынесен в
 * {@link AdminGarantProfPriceModule}, чтобы konstructor (импортит ради
 * PriceService) не тащил админские роуты в свой Swagger. Массовое
 * обновление цен — в модуле эталонных таблиц каталога.
 */
@Module({
    imports: [PackageModule, ComplectModule, SupplyModule],
    providers: [
        PriceService,
        {
            provide: PriceRepository,
            useClass: PricePrismaRepository,
        },
    ],
    exports: [PriceService],
})
export class PriceModule {}
