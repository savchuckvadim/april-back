import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BitrixFieldService } from './services/bitrixfield.service';
import { BitrixFieldRepository } from './repositories/bitrixfield.repository';
import { BitrixFieldPrismaRepository } from './repositories/bitrixfield.prisma.repository';
import { BitrixFieldItemRepository } from './repositories/bitrixfield-item.repository';
import { BitrixFieldItemPrismaRepository } from './repositories/bitrixfield-item.prisma.repository';
import { BitrixFieldController } from './controllers/bitrixfield.controller';

@Module({
    imports: [PrismaModule],
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
    controllers: [BitrixFieldController],
    exports: [BitrixFieldService, BitrixFieldRepository, BitrixFieldItemRepository],
})
export class BitrixFieldModule {}

