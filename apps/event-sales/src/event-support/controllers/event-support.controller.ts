import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventSupportStubService } from '../services/event-support-stub.service';
import { CompanyDealsRequestDto, CompanyDealsResponseDto } from '../dto/deals.dto';
import { NewTaskInitRequestDto, NewTaskInitResponseDto } from '../dto/new-task.dto';
import { TmcDealForReturnDto, TmcDealsRequestDto } from '../dto/tmc-deals.dto';
import { CompanyHistoryRequestDto, HistoryItemDto } from '../dto/history.dto';
import { CallResultsDto, ResultCountRequestDto } from '../dto/result-count.dto';

/**
 * Поддерживающие эндпоинты фронта event-sales (списки сделок, история,
 * счётчики результатов). Контракты повторяют legacy PHP `full/*` и
 * `flow-front/*`; реализация — заглушки, наполняются по фазам миграции
 * (см. docs/legacy-endpoint-gap.md).
 */
@ApiTags('Event Sales Support')
@Controller('event-sales')
export class EventSupportController {
    constructor(private readonly service: EventSupportStubService) {}

    @ApiOperation({
        summary: 'Сделки компании по текущей задаче',
        description:
            'Презентационные сделки, связанные с текущей задачей события. ' +
            'Замена legacy PHP `POST full/deals`. Пока заглушка.',
    })
    @ApiBody({ type: CompanyDealsRequestDto })
    @ApiOkResponse({ type: CompanyDealsResponseDto })
    @Post('deals')
    @HttpCode(200)
    async getCompanyDeals(
        @Body() dto: CompanyDealsRequestDto,
    ): Promise<CompanyDealsResponseDto> {
        return this.service.getCompanyDeals(dto);
    }

    @ApiOperation({
        summary: 'Инициализация контекста «новая задача»',
        description:
            'Сделки для связи, когда у компании нет открытых задач событий. ' +
            'Замена legacy PHP `POST full/newTask/init`. Пока заглушка.',
    })
    @ApiBody({ type: NewTaskInitRequestDto })
    @ApiOkResponse({ type: NewTaskInitResponseDto })
    @Post('new-task/init')
    @HttpCode(200)
    async initNewTask(
        @Body() dto: NewTaskInitRequestDto,
    ): Promise<NewTaskInitResponseDto> {
        return this.service.initNewTask(dto);
    }

    @ApiOperation({
        summary: 'ТМЦ-сделки для возврата в отдел ТМЦ',
        description:
            'ТМЦ-сделки по списку презентационных задач (кнопка WithTM). ' +
            'Замена legacy PHP `POST full/pres/tmcdeals`. Пока заглушка.',
    })
    @ApiBody({ type: TmcDealsRequestDto })
    @ApiOkResponse({ type: TmcDealForReturnDto, isArray: true })
    @Post('pres/tmc-deals')
    @HttpCode(200)
    async getTmcDeals(
        @Body() dto: TmcDealsRequestDto,
    ): Promise<TmcDealForReturnDto[]> {
        return this.service.getTmcDeals(dto);
    }

    @ApiOperation({
        summary: 'История событий по компании',
        description:
            'История звонков/комментариев по компании. ' +
            'Замена legacy PHP `POST flow-front/history`. Пока заглушка.',
    })
    @ApiBody({ type: CompanyHistoryRequestDto })
    @ApiOkResponse({ type: HistoryItemDto, isArray: true })
    @Post('history')
    @HttpCode(200)
    async getCompanyHistory(
        @Body() dto: CompanyHistoryRequestDto,
    ): Promise<HistoryItemDto[]> {
        return this.service.getCompanyHistory(dto);
    }

    @ApiOperation({
        summary: 'Счётчики результатов звонков',
        description:
            'Счётчики результатов звонков пользователя по компании ' +
            '(меню «недозвон», статистика). ' +
            'Замена legacy PHP `POST flow-front/result/count`. Пока заглушка.',
    })
    @ApiBody({ type: ResultCountRequestDto })
    @ApiOkResponse({ type: CallResultsDto })
    @Post('result/count')
    @HttpCode(200)
    async getResultCount(
        @Body() dto: ResultCountRequestDto,
    ): Promise<CallResultsDto> {
        return this.service.getResultCount(dto);
    }
}