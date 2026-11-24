import { Module } from '@nestjs/common';
import { SupplyService } from './services/api/supply.service';
import { SupplyRepository } from './supply.repository';
import { SupplyPrismaRepository } from './supply.prisma.repository';
import { SupplyTextService } from './services/supply-text.service';
import { StorageModule } from 'src/core/storage/storage.module';

/**
 * Сервисный модуль поставок гаранта: провайдеры и экспорт сервисов, без
 * контроллеров. Контроллер `/supply` (создание и правка поставок) вынесен в
 * {@link SupplyAdminModule}, чтобы публичное приложение konstructor,
 * импортирующее модуль ради SupplyService и SupplyTextService, его не
 * регистрировало.
 */
@Module({
    imports: [StorageModule],
    providers: [
        SupplyService,
        SupplyTextService,
        {
            provide: SupplyRepository,
            useClass: SupplyPrismaRepository,
        },
    ],
    exports: [SupplyService, SupplyTextService],
})
export class SupplyModule {}
