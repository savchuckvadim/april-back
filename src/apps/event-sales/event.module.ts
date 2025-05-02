import { Module } from "@nestjs/common";
import { EventSalesController } from "./controllers/event-sales.controller";
import { EventSalesFlowUseCase } from "./use-cases/flow.use-case";
import { PortalModule } from "src/modules/portal/portal.module";
import { BitrixModule } from "src/modules/bitrix/bitrix.module";
import { TelegramModule } from "src/modules/telegram/telegram.module";
import { HttpModule } from "@nestjs/axios";
import { PBXModule } from "src/modules/pbx/pbx.module";


@Module({
    imports: [
        // PortalModule,
        // BitrixModule,
        PBXModule,
        TelegramModule,
        HttpModule
    ],  
    controllers: [EventSalesController],
    providers: [EventSalesFlowUseCase],
    exports: [EventSalesFlowUseCase]

})
export class EventSalesModule { }