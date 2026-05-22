import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PbxRegistryModule } from '@/modules/pbx-registry';
import { BitrixFieldService } from './services/bitrixfield.service';
import { BitrixFieldRepository } from './repositories/bitrixfield.repository';
import { BitrixFieldPrismaRepository } from './repositories/bitrixfield.prisma.repository';
import { BitrixFieldItemRepository } from './repositories/bitrixfield-item.repository';
import { BitrixFieldItemPrismaRepository } from './repositories/bitrixfield-item.prisma.repository';
import { BitrixFieldController } from './controllers/bitrixfield.controller';
import { BitrixFieldInitDataController } from './controllers/bitrixfield-init-data.controller';

@Module({
    imports: [PrismaModule, PbxRegistryModule],
    providers: [
        BitrixFieldService,
        {
            provide: BitrixFieldRepository,
            useClass: BitrixFieldPrismaRepository,
        },
        {
            provide: BitrixFieldItemRepository,
            useClass: BitrixFieldItemPrismaRepository,
        },
    ],
    controllers: [BitrixFieldController, BitrixFieldInitDataController],
    exports: [
        BitrixFieldService,
        BitrixFieldRepository,
        BitrixFieldItemRepository,
    ],
})
export class BitrixFieldModule {}
