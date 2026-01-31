import { RecordsByCompanyUseCase } from "./use-cases/records-by-company.use-case";
import { BxRecordsController } from "./controllers/bx-records.controller";
import { PBXModule } from "@/modules/pbx/pbx.module";
import { Module } from "@nestjs/common";

@Module({
    imports: [PBXModule],
    controllers: [BxRecordsController],
    providers: [RecordsByCompanyUseCase],
})
export class EventSalesBxRecordsModule {}
