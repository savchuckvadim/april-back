import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BxRqService } from './services/bx-rq.service';
import { BxRqRepository } from './repositories/bx-rq.repository';
import { BxRqPrismaRepository } from './repositories/bx-rq.prisma.repository';
import { BxRqController } from './controllers/bx-rq.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        BxRqService,
        {
            provide: BxRqRepository,
            useClass: BxRqPrismaRepository,
        },
    ],
    controllers: [BxRqController],
    exports: [BxRqService, BxRqRepository],
})
export class BxRqModule {}

