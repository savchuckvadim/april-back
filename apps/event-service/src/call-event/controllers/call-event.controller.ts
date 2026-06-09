import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CallingEventDto } from '../dto/calling-event.dto';
import { CallingEventResponseDto } from '../dto/calling-event-response.dto';
import { CallEventQueueService } from '../queue/call-event-queue.service';

/**
 * Приём хука Bitrix о событии звонка (отдел сервиса). Кладёт событие в очередь
 * и сразу отвечает Bitrix `{ resultCode: 0 }`; вся обработка идёт в воркере.
 */
@ApiTags('Event Service Calling')
@Controller('event-service/calling')
export class CallEventController {
    private readonly logger = new Logger(CallEventController.name);

    constructor(private readonly queueService: CallEventQueueService) {}

    @ApiOperation({
        summary: 'Хук события звонка',
        description:
            'Принимает событие звонка от Bitrix, ставит его в очередь обработки ' +
            '(задачи, ОРК-история, смарт-отчёт) и мгновенно отвечает resultCode=0.',
    })
    @ApiBody({ type: CallingEventDto })
    @ApiOkResponse({
        description: 'Событие принято и поставлено в очередь.',
        type: CallingEventResponseDto,
    })
    @Post()
    @HttpCode(200)
    async handle(
        @Body() dto: CallingEventDto,
    ): Promise<CallingEventResponseDto> {
        this.logger.log(
            `calling: domain=${dto.domain}, company=${dto.bx?.companyId}, deal=${dto.bx?.dealId}`,
        );
        await this.queueService.enqueue(dto);
        return { resultCode: 0 };
    }

    // @ApiOperation({ summary: 'CORS preflight хука звонка' })
    // @ApiOkResponse({ type: CallingEventResponseDto })
    // @Options()
    // @HttpCode(200)
    // preflight(): CallingEventResponseDto {
    //     return { resultCode: 0 };
    // }
}
