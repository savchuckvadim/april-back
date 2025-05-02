import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { PortalProviderService } from "src/modules/portal/services/portal-provider.service";
// import { BitrixContextService } from "src/modules/bitrix/services/bitrix-context.service";
import { EventSalesFlowDto } from "../dto/event-sales-flow.dto";
import { EventSalesFlowUseCase } from "../use-cases/flow.use-case";
import { BitrixApiService } from "src/modules/bitrix/core/http/bitrix-api.service";


@Controller('event-sales')
export class EventSalesController {
    constructor(
        private readonly portalProvider: PortalProviderService,
        // private readonly bitrixContext: BitrixContextService,
        private readonly bitrixApi: BitrixApiService,
        private readonly flowService: EventSalesFlowUseCase
    ) { }


    @Post('flow')
    @HttpCode(200)
    async getFlow(@Body() dto: EventSalesFlowDto) {
        // this.bitrixContext.initFromRequestContext();
        // const service = new EventSalesFlowUseCase(this.portalProvider);
        await this.flowService.init(dto);
        const result = await this.flowService.getFlow();
        return result;
    }
}
