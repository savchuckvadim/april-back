import { Body, Controller, Logger, Post, Query } from '@nestjs/common';
import { ColdCallQueryDto } from '../dto/cold.dto';
import { ColdCallHookResponseDto } from '../dto/cold-call-response.dto';
import { BxWebHookDto } from '@/apps/ork-documents/act/ork-act.dto';
import { ColdHookSilinceEndpointService } from '../services/silence/cold-hook-silince-endpoint.service';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Event Sales Cold Hook')
@Controller('event-sales-hook')
export class EventSalesHookController {
    private readonly logger = new Logger(EventSalesHookController.name);

    constructor(
        private readonly hookEdpointService: ColdHookSilinceEndpointService,
    ) {}

    /**
     * Постановка холодного звонка.
     *
     * Принимает хук из Bitrix (домен берётся из тела `auth.domain`), а параметры
     * самого звонка — из query (`ColdCallQueryDto`). Сырой `deadline` приходит
     * БЕЗ таймзоны и трактуется как локальное время портала; его дальнейшая
     * конвертация в server-time задач (Москва) и CRM-поля логируется по тегу
     * `[DEADLINE]` на всём пути обработки.
     */
    @Post('cold-call')
    @ApiOperation({
        summary: 'Поставить холодный звонок',
        description:
            'Принимает хук холодного звонка и кладёт его в silence-буфер на ' +
            'отложенную обработку. Создание сделок, задачи и элементов KPI в ' +
            'Bitrix выполняется асинхронно после окна тишины. Дедлайн (query ' +
            '`deadline`) трактуется как локальное время портала и конвертируется ' +
            'в Москву для задачи и в локаль портала для CRM-полей.',
    })
    @ApiBody({
        type: BxWebHookDto,
        description:
            'Тело хука Bitrix. Используется только `auth.domain` — портал, ' +
            'для которого ставится холодный звонок (определяет таймзону).',
    })
    @ApiOkResponse({
        type: ColdCallHookResponseDto,
        description:
            'Хук принят и поставлен в очередь отложенной обработки ' +
            '(silence-буфер). Ответ описывает факт приёма, а не результат ' +
            'создания сущностей в Bitrix.',
    })
    async coldCall(
        @Body() body: BxWebHookDto,
        @Query() dto: ColdCallQueryDto,
    ): Promise<ColdCallHookResponseDto> {
        const domain = body.auth.domain;
        this.logger.log(
            `[DEADLINE][controller] POST cold-call domain=${domain} ` +
                `entityType=${dto.entityType} entityId=${dto.entityId} ` +
                `responsible=${dto.responsible} created=${dto.created} ` +
                `isTmc=${dto.isTmc} rawDeadline="${dto.deadline}" ` +
                `(сырой ввод, локальное время портала, БЕЗ таймзоны)`,
        );
        return this.hookEdpointService.createColdCallHook(domain, dto);
    }
}
