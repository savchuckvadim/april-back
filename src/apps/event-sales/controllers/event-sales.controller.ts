import { Body, Controller, HttpCode, Post, Logger } from '@nestjs/common';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
// import { EventSalesFlowUseCase } from '../use-cases/flow.use-case';

@Controller('event-sales')
export class EventSalesController {
    private readonly logger = new Logger(EventSalesController.name);

    constructor() {}

    @Post('flow')
    @HttpCode(200)
    getFlow(@Body() dto: EventSalesFlowDto): EventSalesFlowDto {
        return dto;
        // this.logger.debug(
        //     'Received flow request:',
        //     JSON.stringify(dto, null, 2),
        // );
        // this.bitrixContext.initFromRequestContext();
        // const service = new EventSalesFlowUseCase(this.portalProvider);

        // const result = await this.flowService.getFlow(dto);
        // return result;
    }
}
