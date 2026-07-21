import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventSupportStubService } from '../services/event-support-stub.service';
import {
    CompanyDealsRequestDto,
    CompanyDealsResponseDto,
} from '../dto/deals.dto';
import {
    NewTaskInitRequestDto,
    NewTaskInitResponseDto,
} from '../dto/new-task.dto';
import { TmcDealFoundDto, TmcDealsRequestDto } from '../dto/tmc-deals.dto';
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
    @ApiBody({
        type: CompanyDealsRequestDto,
        description: 'Домен портала и текущая задача события.',
    })
    @ApiOkResponse({
        type: CompanyDealsResponseDto,
        description: 'Презентационные сделки, связанные с задачей.',
    })
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
    @ApiBody({
        type: NewTaskInitRequestDto,
        description: 'Домен портала, компания и пользователь.',
    })
    @ApiOkResponse({
        type: NewTaskInitResponseDto,
        description: 'Сделки для связи с новой задачей.',
    })
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
    @ApiBody({
        type: TmcDealsRequestDto,
        description: 'Домен портала и список презентационных задач.',
    })
    @ApiOkResponse({
        type: TmcDealFoundDto,
        isArray: true,
        description: 'Найденные ТМЦ-сделки по задачам.',
    })
    @Post('pres/tmc-deals')
    @HttpCode(200)
    async getTmcDeals(
        @Body() dto: TmcDealsRequestDto,
    ): Promise<TmcDealFoundDto[]> {
        return this.service.getTmcDeals(dto);
    }

    @ApiOperation({
        summary: 'История событий по компании',
        description:
            'История звонков/комментариев по компании. ' +
            'Замена legacy PHP `POST flow-front/history`. Пока заглушка.',
    })
    @ApiBody({
        type: CompanyHistoryRequestDto,
        description: 'Домен портала и идентификатор компании.',
    })
    @ApiOkResponse({
        type: HistoryItemDto,
        isArray: true,
        description: 'История звонков и комментариев по компании.',
    })
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
    @ApiBody({
        type: ResultCountRequestDto,
        description: 'Домен портала, компания и пользователь.',
    })
    @ApiOkResponse({
        type: CallResultsDto,
        description: 'Счётчики результатов звонков пользователя.',
    })
    @Post('result/count')
    @HttpCode(200)
    async getResultCount(
        @Body() dto: ResultCountRequestDto,
    ): Promise<CallResultsDto> {
        return this.service.getResultCount(dto);
    }
}
