import { Injectable, Logger } from '@nestjs/common';
import {
    CompanyDealsRequestDto,
    CompanyDealsResponseDto,
} from '../dto/deals.dto';
import {
    NewTaskInitRequestDto,
    NewTaskInitResponseDto,
} from '../dto/new-task.dto';
import { TmcDealForReturnDto, TmcDealsRequestDto } from '../dto/tmc-deals.dto';
import { CompanyHistoryRequestDto, HistoryItemDto } from '../dto/history.dto';
import { CallResultsDto, ResultCountRequestDto } from '../dto/result-count.dto';

/**
 * ВРЕМЕННЫЕ ЗАГЛУШКИ поддерживающих эндпоинтов event-sales.
 *
 * Контракты (DTO) — реверс legacy PHP-эндпоинтов `full/*` и `flow-front/*`
 * (см. docs/legacy-endpoint-gap.md). Реализация наполняется по фазам
 * миграции фронта; до этого каждый метод возвращает типизированный
 * пустой ответ, чтобы orval-клиент и фронт компилировались против
 * финального контракта.
 */
@Injectable()
export class EventSupportStubService {
    private readonly logger = new Logger(EventSupportStubService.name);

    // TODO(migration): порт логики legacy PHP full/deals (поиск презентационных сделок по задаче)
    async getCompanyDeals(
        dto: CompanyDealsRequestDto,
    ): Promise<CompanyDealsResponseDto> {
        this.logger.warn(`STUB event-sales/deals: domain=${dto.domain}`);
        return { allPresentationDeals: null };
    }

    // TODO(migration): порт логики legacy PHP full/newTask/init
    async initNewTask(
        dto: NewTaskInitRequestDto,
    ): Promise<NewTaskInitResponseDto> {
        this.logger.warn(
            `STUB event-sales/new-task/init: domain=${dto.domain}, userId=${dto.userId}`,
        );
        return { deals: { allPresentationDeals: null } };
    }

    // TODO(migration): порт логики legacy PHP full/pres/tmcdeals
    async getTmcDeals(dto: TmcDealsRequestDto): Promise<TmcDealForReturnDto[]> {
        this.logger.warn(
            `STUB event-sales/pres/tmc-deals: domain=${dto.domain}, tasks=${dto.tasks?.length ?? 0}`,
        );
        return [];
    }

    // TODO(migration): порт логики legacy PHP flow-front/history
    async getCompanyHistory(
        dto: CompanyHistoryRequestDto,
    ): Promise<HistoryItemDto[]> {
        this.logger.warn(
            `STUB event-sales/history: domain=${dto.domain}, companyId=${dto.companyId}`,
        );
        return [];
    }

    // TODO(migration): порт логики legacy PHP flow-front/result/count
    async getResultCount(dto: ResultCountRequestDto): Promise<CallResultsDto> {
        this.logger.warn(
            `STUB event-sales/result/count: domain=${dto.domain}, companyId=${dto.companyId}, userId=${dto.userId}`,
        );
        return {
            noresultCount: 0,
            resultCount: 0,
            presentationCount: 0,
            inProgressCount: 0,
            inMoneyCount: 0,
        };
    }
}
