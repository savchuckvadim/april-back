import { Module } from '@nestjs/common';
import { SupplyController } from './supply.controller';
import { SupplyService } from './services/api/supply.service';
import { SupplyRepository } from './supply.repository';
import { SupplyPrismaRepository } from './supply.prisma.repository';
import { SupplyTextService } from './services/supply-text.service';
import { StorageModule } from 'src/core/storage/storage.module';

@Module({
    imports: [StorageModule],
    controllers: [SupplyController],
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
