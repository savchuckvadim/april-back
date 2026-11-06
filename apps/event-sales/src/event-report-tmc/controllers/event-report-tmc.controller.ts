import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpException,
    Logger,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventFlowOperationDto } from '../../event-report/dto/response/event-flow-operation.dto';
import { TmcPresentationApprovedDto } from '../dto/tmc-presentation-approved.dto';
import { TmcPresentationApprovalService } from '../services/tmc-presentation-approval.service';
import { mergeRobotParams } from '../lib/merge-robot-params.util';

@ApiTags('Event Sales')
@Controller('event-sales/tmc')
export class EventReportTmcController {
    private readonly logger = new Logger(EventReportTmcController.name);

    constructor(private readonly approval: TmcPresentationApprovalService) {}

    /**
     * Робот бизнес-процесса РПА «Заявка на презентацию» зовёт ручку после
     * утверждения заявки руководителем — замена легаси
     * `/api/full/initpres/success`. Параметры робот шлёт строкой запроса,
     * а блок `auth` — телом, поэтому читаются оба источника: из тела берётся
     * только то, что в нём есть (см. mergeRobotParams).
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
        return this.accept(mergeRobotParams(query, body), 'POST');
    }

    /**
     * Та же ручка для робота, который шлёт параметры строкой запроса без
     * тела («Запрос по адресу» методом GET): раньше такой вызов получал 404
     * и согласование молча терялось.
     */
    @ApiOperation({
        summary: 'ТМЦ: заявка на презентацию согласована (GET-вариант)',
        description:
            'То же, что POST: для роботов, которые передают параметры только ' +
            'в адресе.',
    })
    @ApiOkResponse({
        description: 'Операция принята (или уже была принята ранее).',
        type: EventFlowOperationDto,
    })
    @Get('presentation-approved')
    async presentationApprovedByGet(
        @Query() query: TmcPresentationApprovedDto,
    ): Promise<EventFlowOperationDto> {
        return this.accept(query, 'GET');
    }

    /**
     * Любой вызов робота виден в логе ещё до проверки параметров: иначе
     * отклонённый запрос (нет домена, пустая сделка) не оставлял следа, и
     * «ручка молчит» было неотличимо от «робот не звонил».
     */
    private async accept(
        dto: TmcPresentationApprovedDto,
        method: 'GET' | 'POST',
    ): Promise<EventFlowOperationDto> {
        const domain = dto.auth?.domain ?? dto.domain ?? '';
        // Пометка портала в meta: без неё строки ручки не видны в журнале,
        // отфильтрованном по порталу, и отказ робота неотличим от молчания.
        const meta = domain ? { domain } : {};
        const summary =
            `domain=${domain || '-'}, tmcDeal=${String(dto.tmcDealId ?? '-')}, ` +
            `company=${String(dto.companyId ?? '-')}, manager=${String(dto.managerId ?? '-')}, ` +
            `deadline=${String(dto.deadline ?? '-')}`;
        this.logger.log(
            `tmc/presentation-approved ${method}: ${summary}`,
            meta,
        );
        try {
            return await this.approval.accept(dto);
        } catch (error) {
            const status =
                error instanceof HttpException ? error.getStatus() : 500;
            this.logger.warn(
                `tmc/presentation-approved ${method} отклонён (${status}): ${(error as Error).message} — ${summary}`,
                meta,
            );
            throw error;
        }
    }
}
