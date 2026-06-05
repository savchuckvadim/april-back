import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EventReportUseCase } from '../event-report/use-cases/event-report.use-case';

@Controller('event-sales')
export class EventSalesController {
    private readonly logger = new Logger(EventSalesController.name);

    constructor(private readonly eventReportUseCase: EventReportUseCase) {}

    @Post('flow')
    @HttpCode(200)
    async getFlow(@Body() dto: EventSalesFlowDto) {
        this.logger.log(
            `event-sales/flow: domain=${dto.domain}, plan=${dto.plan?.type?.current?.code}, report=${dto.report?.resultStatus}`,
        );
        return this.eventReportUseCase.execute(dto);
    }
}
