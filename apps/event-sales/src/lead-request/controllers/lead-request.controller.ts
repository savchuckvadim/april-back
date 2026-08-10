import {
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
import { LeadRequestService } from '../services/lead-request.service';
import { LeadRequestCardDto } from '../dto/lead-request-card.dto';
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
    constructor(private readonly service: LeadRequestService) {}

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
}
