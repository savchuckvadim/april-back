import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { EventSalesFlowDto } from "../dto/event-sales-flow.dto";
import { EventSalesFlowUseCase } from "../use-cases/flow.use-case";

@Controller('event-sales')
export class EventSalesController {
    constructor(
        // private readonly portalService: PortalContextService,
        // private readonly bitrixContext: BitrixContextService,
        // private readonly bitrixApi: BitrixRequestApiService,
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
