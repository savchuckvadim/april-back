import { Module } from '@nestjs/common';
import { BitrixPlacementService } from './services/bitrix-placement.service';

import { BitrixPlacementRepository } from './repositories/bitrix-placement.repository';
import { BitrixPlacementController } from './controllers/bitrix-placement.controller';
import { PrismaService } from 'src/core/prisma';
import { BitrixPlacementPrismaRepository } from './repositories/bitrix-placement.prisma.repository';

@Module({
    imports: [],
    controllers: [
        BitrixPlacementController,
    ],
    providers: [
        BitrixPlacementService,
        {
            provide: BitrixPlacementRepository,
            useClass: BitrixPlacementPrismaRepository,
        },
        PrismaService,
    ],
    exports: [
        BitrixPlacementService,
        BitrixPlacementRepository,
    ],
})
export class PlacementModule { }
