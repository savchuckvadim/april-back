import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EventSalesFlowResponseDto } from '../dto/response/event-sales-flow-response.dto';
import { EventReportUseCase } from '../use-cases/event-report.use-case';

@ApiTags('Event Sales')
@Controller('event-sales')
export class EventSalesController {
    private readonly logger = new Logger(EventSalesController.name);

    constructor(private readonly eventReportUseCase: EventReportUseCase) {}

    /**
     * Обработка события фронта event-sales: формирование отчёта и
     * планирование звонка. Принимает полный flow-DTO, прогоняет его через
     * {@link EventReportUseCase} и возвращает сводку отправленных в Bitrix команд.
     * Работает на очередях
     */

    @ApiOperation({
        summary: 'Event sales flow',
        description:
            'Обработка события фронта event-sales — отчёт и планирование звонка. ' +
            'Принимает flow-DTO, оркестрирует batch-команды Bitrix и отправляет их одним HTTP-вызовом.',
    })
    @ApiBody({
        type: EventSalesFlowDto,
    })
    @ApiOkResponse({
        description:
            'Flow выполнен: команды сформированы и отправлены в Bitrix.',
        type: EventSalesFlowResponseDto,
    })
    @Post('flow')
    @HttpCode(200)
    async getFlow(
        @Body() dto: EventSalesFlowDto,
    ): Promise<EventSalesFlowResponseDto> {
        this.logger.log(
            `event-sales/flow: domain=${dto.domain}, plan=${dto.plan?.type?.current?.code}, report=${dto.report?.resultStatus}`,
        );
        return this.eventReportUseCase.execute(dto);
    }
}
