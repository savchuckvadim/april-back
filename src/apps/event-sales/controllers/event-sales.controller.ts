import { Body, Controller, HttpCode, Post, Logger } from '@nestjs/common';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EventSalesFlowUseCase } from '../use-cases/flow.use-case';

@Controller('event-sales')
export class EventSalesController {
    private readonly logger = new Logger(EventSalesController.name);

    constructor(
        // private readonly portalService: PortalContextService,
        // private readonly bitrixContext: BitrixContextService,
        // private readonly bitrixApi: BitrixRequestApiService,
        private readonly flowService: EventSalesFlowUseCase,
    ) {}

    @Post('flow')
    @HttpCode(200)
    async getFlow(@Body() dto: EventSalesFlowDto) {
        this.logger.debug(
            'Received flow request:',
            JSON.stringify(dto, null, 2),
        );
        // this.bitrixContext.initFromRequestContext();
        // const service = new EventSalesFlowUseCase(this.portalProvider);
        await this.flowService.init(dto);
        const result = await this.flowService.getFlow(dto.domain);
        return result;
    }
}
