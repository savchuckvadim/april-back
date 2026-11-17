import { RecordsByCompanyUseCase } from './use-cases/records-by-company.use-case';
import { BxRecordsController } from './controllers/bx-records.controller';
import { ClientCallsUseCase } from './client-calls/client-calls.use-case';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';
import {
    AiModule,
    CallPageLinkModule,
    TranscriptionStoreModule,
} from '@lib/call-lib';

@Module({
    imports: [
        PBXModule,
        PortalSessionModule,
        // Список звонков клиента: состояние расшифровки, действующий разбор
        // и адрес страницы разбора — лёгкие модули без очередей и Яндекса.
        TranscriptionStoreModule,
        AiModule,
        CallPageLinkModule,
    ],
    controllers: [BxRecordsController],
    providers: [RecordsByCompanyUseCase, ClientCallsUseCase],
})
export class EventSalesBxRecordsModule {}
