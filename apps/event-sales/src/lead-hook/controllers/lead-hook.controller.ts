import { Body, Controller, Logger, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BxWebHookDto } from '@/modules/bitrix/dto/bx-webhook.dto';
import { LeadColdCallQueryDto } from '../dto/lead-cold.dto';
import { LeadColdCallResponseDto } from '../dto/lead-cold-response.dto';
import { LeadColdEndpointService } from '../services/lead-cold-endpoint.service';

@ApiTags('Event Sales Lead Hook')
@Controller('event-sales-lead-hook')
export class EventSalesLeadHookController {
    private readonly logger = new Logger(EventSalesLeadHookController.name);

    constructor(
        private readonly leadColdEndpointService: LeadColdEndpointService,
    ) {}

    /**
     * Полный event-флоу лида (аналог легаси FullEventFlowLeadController::cold).
     *
     * Принимает хук из Bitrix (домен берётся из тела `auth.domain`), параметры
     * лида — из query (`LeadColdCallQueryDto`). Находит/создаёт компанию для
     * лида, привязывает лид к компании и запускает обычный cold-флоу по
     * компании (закрытие старых сделок/задач, base/XO сделки, задача,
     * KPI-элементы) — синхронно, без silence-буфера.
     */
    @Post('cold-call')
    @ApiOperation({
        summary: 'Полный event-флоу лида: холодный звонок',
        description:
            'Принимает хук лида, находит или создаёт компанию, привязывает ' +
            'лид к компании (COMPANY_ID) и запускает cold-флоу по компании ' +
            'через общий обработчик холодных звонков. Выполняется сразу, ' +
            'без silence-буфера. Дедлайн (query `deadline`) трактуется как ' +
            'локальное время портала.',
    })
    @ApiBody({
        type: BxWebHookDto,
        description:
            'Тело хука Bitrix. Используется только `auth.domain` — портал, ' +
            'для которого выполняется флоу лида (определяет таймзону).',
    })
    @ApiOkResponse({
        type: LeadColdCallResponseDto,
        description:
            'Флоу выполнен: лид привязан к компании, cold-флоу по компании ' +
            'обработан общим обработчиком холодных звонков.',
    })
    async coldCall(
        @Body() body: BxWebHookDto,
        @Query() dto: LeadColdCallQueryDto,
    ): Promise<LeadColdCallResponseDto> {
        const domain = body.auth.domain;
        this.logger.log(
            `[LEAD-COLD][controller] POST cold-call domain=${domain} ` +
                `leadId=${dto.leadId} assigned=${dto.assigned} ` +
                `rawDeadline="${dto.deadline}" ` +
                `(сырой ввод, локальное время портала, БЕЗ таймзоны)`,
        );
        return this.leadColdEndpointService.createLeadColdCall(domain, dto);
    }
}
