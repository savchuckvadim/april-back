import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventFlowOperationDto } from '../../event-report/dto/response/event-flow-operation.dto';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';
import { TmcPresentationApprovalService } from '../services/tmc-presentation-approval.service';

@ApiTags('Event Sales')
@Controller('event-sales/tmc')
export class EventReportTmcController {
    constructor(private readonly approval: TmcPresentationApprovalService) {}

    /**
     * Робот бизнес-процесса РПА «Заявка на презентацию» зовёт ручку после
     * утверждения заявки руководителем — замена легаси
     * `/api/full/initpres/success`. Параметры робот шлёт формой либо
     * строкой запроса, поэтому читаются оба источника (тело важнее).
     */
    @ApiOperation({
        summary: 'ТМЦ: заявка на презентацию согласована',
        description:
            'Ставит в очередь отчёт «запланирована презентация» от имени ' +
            'менеджера ОП: основная сделка менеджера, сделка и элемент ' +
            'смарта «Презентации» (заявка ТМЦ продвигается в ' +
            '«Запланирована»), задача менеджеру, KPI; ТМЦ-сделка ' +
            'привязывается к презентации и переводится в «Заявка принята». ' +
            'Повторный вызов с теми же сделкой, менеджером и датой возвращает ' +
            'статус уже принятой операции и НЕ планирует презентацию второй раз.',
    })
    @ApiBody({ type: TmcPresentationApprovedDto })
    @ApiOkResponse({
        description: 'Операция принята (или уже была принята ранее).',
        type: EventFlowOperationDto,
    })
    @Post('presentation-approved')
    @HttpCode(200)
    async presentationApproved(
        @Body() body: TmcPresentationApprovedDto,
        @Query() query: TmcPresentationApprovedDto,
    ): Promise<EventFlowOperationDto> {
        return this.approval.accept({ ...query, ...body });
    }
}
