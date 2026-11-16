import { RecordsByCompanyUseCase } from './use-cases/records-by-company.use-case';
import { BxRecordsController } from './controllers/bx-records.controller';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';

@Module({
    imports: [PBXModule, PortalSessionModule],
    controllers: [BxRecordsController],
    providers: [RecordsByCompanyUseCase],
})
export class EventSalesBxRecordsModule {}
