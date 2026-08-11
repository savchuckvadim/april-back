import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { BxWebHookDto } from '@lib/bitrix/dto/bx-webhook.dto';
import { EnumSalesHookCode } from '../../sales-hooks/core/constants/sales-hook-code.enum';
import { SalesHookAcceptedDto } from '../../sales-hooks/core/dto/sales-hook-accepted.dto';
import { SalesHookSilenceGateway } from '../../sales-hooks/core/services/sales-hook-silence.gateway';
import { ILeadAcceptItem } from '../../sales-hooks/lead-accept/use-cases/lead-accept.use-case';
import { LeadRequestService } from '../services/lead-request.service';
import { LeadRequestAcceptService } from '../services/lead-request-accept.service';
import { LeadRequestCardDto } from '../dto/lead-request-card.dto';
import {
    LeadRequestAcceptDto,
    LeadRequestAcceptResultDto,
} from '../dto/lead-request-accept.dto';
import {
    LeadRequestUpdateDto,
    LeadRequestUpdateResultDto,
} from '../dto/lead-request-update.dto';

/**
 * Карточка заявки/лида для приложения «Звонки»: статусы и стадии заявки,
 * тип «не ЦА», чёрный список, маркеры дублей, оценка лидогена (ссылка),
 * история обработки и готовность к фиксации продажи.
 */
@ApiTags('Event Sales Lead Request')
@Controller('lead-request')
export class LeadRequestController {
    constructor(
        private readonly service: LeadRequestService,
        private readonly acceptService: LeadRequestAcceptService,
        private readonly silence: SalesHookSilenceGateway,
    ) {}

    @Get('card/:leadId')
    @ApiOperation({
        summary: 'Карточка заявки/лида',
        description:
            'Читает лид и возвращает всё для интерфейса заявки в «Звонках»: ' +
            'признак заявки, ссылку «Оценка» (открывать в соседней вкладке), ' +
            'код партнёра, статусы/стадии с вариантами, булевы маркеры, ' +
            'историю обработки и готовность к продаже (что не отмечено).',
    })
    @ApiParam({
        name: 'leadId',
        description: 'Идентификатор лида Bitrix.',
        type: Number,
        example: 42,
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @ApiOkResponse({
        type: LeadRequestCardDto,
        description: 'Карточка заявки/лида.',
    })
    async card(
        @Param('leadId', ParseIntPipe) leadId: number,
        @Query('domain') domain: string,
    ): Promise<LeadRequestCardDto> {
        return this.service.card(domain, leadId);
    }

    @Post('update')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Обновить карточку заявки/лида',
        description:
            'Типизированное обновление статусов/стадий/маркеров. Правило: ' +
            'статус «Не ЦА» без типа «не ЦА» отклоняется (400). Каждое ' +
            'изменение дописывается в историю обработки заявки — прошлые ' +
            'записи не редактируются.',
    })
    @ApiBody({
        type: LeadRequestUpdateDto,
        description: 'Изменяемые поля карточки (все опциональны).',
    })
    @ApiOkResponse({
        type: LeadRequestUpdateResultDto,
        description: 'Итог обновления: применённые изменения и предупреждения.',
    })
    async update(
        @Body() dto: LeadRequestUpdateDto,
    ): Promise<LeadRequestUpdateResultDto> {
        return this.service.update(dto);
    }

    @Post('accept')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Принять заявку в работу (кнопка в «Звонках»)',
        description:
            'Фиксирует ПРИНЯТИЕ заявки менеджером (назначение ≠ принятие): ' +
            'стадия лида → «Взята в работу», site-метки, время первичной ' +
            'обработки (op_lead_firstprepare_long — от назначения ХО до ' +
            'принятия), запись в историю. Идемпотентно: повтор после ' +
            'последнего назначения возвращает already=true.',
    })
    @ApiBody({
        type: LeadRequestAcceptDto,
        description: 'Лид и кто принял.',
    })
    @ApiOkResponse({
        type: LeadRequestAcceptResultDto,
        description: 'Итог принятия.',
    })
    async accept(
        @Body() dto: LeadRequestAcceptDto,
    ): Promise<LeadRequestAcceptResultDto> {
        return this.acceptService.accept(dto);
    }

    @Post('accept/webhook')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Вебхук робота: заявка принята (менеджер двинул стадию)',
        description:
            'Принятие от робота Bitrix ЧЕРЕЗ SILENCE-БУФЕР: бурст запросов ' +
            'по одному лиду схлопывается в один вызов, обработка идёт в ' +
            'очереди — эхо-шторм робота сервис не роняет. Менеджер живёт в ' +
            'СВОЕЙ воронке сделок, поэтому обычный триггер — робот на смену ' +
            'стадии СДЕЛКИ (шлёт dealId; лид резолвится по связям); робот ' +
            'на стадии лида шлёт leadId. Домен — из auth вебхука.',
    })
    @ApiBody({
        type: BxWebHookDto,
        description: 'Стандартное тело вебхука Битрикс (auth.domain).',
    })
    @ApiQuery({
        name: 'leadId',
        description: 'Идентификатор лида (заявки); либо dealId.',
        type: Number,
        required: false,
        example: 42,
    })
    @ApiQuery({
        name: 'dealId',
        description: 'Идентификатор основной сделки менеджера; либо leadId.',
        type: Number,
        required: false,
        example: 1024,
    })
    @ApiOkResponse({
        type: SalesHookAcceptedDto,
        description: 'Событие принято в silence-буфер.',
    })
    async acceptWebhook(
        @Body() body: BxWebHookDto,
        @Query('leadId') leadIdRaw?: string,
        @Query('dealId') dealIdRaw?: string,
    ): Promise<SalesHookAcceptedDto> {
        const domain = body.auth.domain;
        const leadId = this.positiveIntOrUndefined(leadIdRaw);
        const dealId = this.positiveIntOrUndefined(dealIdRaw);
        if (!leadId && !dealId) {
            throw new BadRequestException('Нужен leadId либо dealId');
        }
        const scope = leadId ? `lead:${leadId}` : `deal:${dealId}`;
        const keyPrefix = await this.silence.accept<ILeadAcceptItem>(
            EnumSalesHookCode.LEAD_ACCEPT,
            domain,
            scope,
            { entityKey: scope, data: { leadId, dealId } },
        );
        return {
            accepted: true,
            hook: EnumSalesHookCode.LEAD_ACCEPT,
            domain,
            keyPrefix,
        };
    }

    /** Query робота приходит строкой; мусор → undefined (валидирует сервис). */
    private positiveIntOrUndefined(
        raw: string | undefined,
    ): number | undefined {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }
}
