import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { CounterAdminController } from './controllers/counter-admin.controller';
import { CounterNumberController } from './controllers/counter-number.controller';
import { CounterAdminService } from './services/counter-admin.service';
import { CounterNumberService } from './services/counter-number.service';
import { CounterRepository } from './repository/counter.repository';
import { CounterPrismaRepository } from './repository/counter.prisma.repository';

@Module({
    imports: [PrismaModule],
    controllers: [CounterAdminController, CounterNumberController],
    providers: [
        CounterAdminService,
        CounterNumberService,
        {
            provide: CounterRepository,
            useClass: CounterPrismaRepository,
        },
    ],
    exports: [CounterNumberService, CounterAdminService],
})
export class DocumentCounterModule {}
