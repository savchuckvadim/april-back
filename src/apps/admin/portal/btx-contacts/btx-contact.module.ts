import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BtxContactService } from './services/btx-contact.service';
import { BtxContactRepository } from './repositories/btx-contact.repository';
import { BtxContactPrismaRepository } from './repositories/btx-contact.prisma.repository';
import { BtxContactController } from './controllers/btx-contact.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        BtxContactService,
        {
            provide: BtxContactRepository,
            useClass: BtxContactPrismaRepository,
        },
    ],
    controllers: [BtxContactController],
    exports: [BtxContactService, BtxContactRepository],
})
export class BtxContactModule {}

