import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { BtxCompanyService } from './services/btx-company.service';
import { BtxCompanyRepository } from './repositories/btx-company.repository';
import { BtxCompanyPrismaRepository } from './repositories/btx-company.prisma.repository';
import { BtxCompanyController } from './controllers/btx-company.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        BtxCompanyService,
        {
            provide: BtxCompanyRepository,
            useClass: BtxCompanyPrismaRepository,
        },
    ],
    controllers: [BtxCompanyController],
    exports: [BtxCompanyService, BtxCompanyRepository],
})
export class BtxCompanyModule {}

