import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { SalesFinanceCacheService } from './cache/sales-finance-cache.service';
import {
    buildClosedResultKey,
    buildHotClientsKey,
    buildResetPattern,
} from './cache/cache-key.util';
import { ClosedSalesRequestDto } from './dto/closed-sales-request.dto';
import {
    ClosedSalesReportDto,
    ClosedSalesResponseDto,
} from './dto/closed-sales-response.dto';
import { HotClientsRequestDto } from './dto/hot-clients-request.dto';
import {
    HotClientsReportDto,
    HotClientsResponseDto,
} from './dto/hot-clients-response.dto';
import {
    SalesFinanceCacheResetRequestDto,
    SalesFinanceCacheResetResponseDto,
} from './dto/cache-reset.dto';
import {
    ClosedSalesJobData,
    HotClientsJobData,
} from './dto/sales-finance-job.dto';

/**
 * Финансовая аналитика отдела продаж (воронка «ОП Основная»).
 *
 * Паттерн «кэш-синхронно + очередь при промахе»: контроллер только читает
 * Redis-кэш и ставит Bull-джобы — весь compute в SalesFinanceQueueProcessor,
 * готовый результат приходит клиенту по WS на socketId.
 */
@ApiTags('Sales Finance')
@Controller('sales-finance')
export class SalesFinanceController {
    constructor(
        private readonly queue: QueueDispatcherService,
        private readonly cache: SalesFinanceCacheService,
    ) {}

    @Post('closed-sales')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Финансовый отчёт по закрытым продажам',
        description:
            'Сделки воронки «ОП Основная», закрытые в успех за период, по сотрудникам: ' +
            'аванс, оплаченные месяцы, месячная сумма, ожидаемая сумма за договор. ' +
            'Полные прошлые месяцы отдаются из кэша; при промахе отчёт считается ' +
            'в очереди, результат приходит по WS событием sales-finance:closed-sales:done.',
    })
    @ApiBody({ type: ClosedSalesRequestDto })
    @ApiOkResponse({ type: ClosedSalesResponseDto })
    async getClosedSales(
        @Body() dto: ClosedSalesRequestDto,
    ): Promise<ClosedSalesResponseDto> {
        const forceRefresh = dto.forceRefresh === true;
        const resultKey = buildClosedResultKey(
            dto.domain,
            dto.filters.dateFrom,
            dto.filters.dateTo,
            dto.filters.assignedIds,
        );

        if (!forceRefresh) {
            const cached =
                await this.cache.getJson<ClosedSalesReportDto>(resultKey);
            if (cached) return { status: 'ready', data: cached };
        }

        const jobData: ClosedSalesJobData = {
            domain: dto.domain,
            socketId: dto.socketId,
            forceRefresh,
            filters: dto.filters,
        };
        // jobId = ключ результата (домен уже внутри): даблклик/второй юзер
        // с теми же фильтрами не плодят второй прогон — подписываются на
        // идущий job; removeOnComplete/Fail освобождают id после завершения.
        await this.queue.dispatch(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_FINANCE_CLOSED_SALES,
            jobData,
            resultKey,
            { removeOnComplete: true, removeOnFail: true },
        );
        return { status: 'queued' };
    }

    @Post('hot-clients')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Горячие клиенты: открытые сделки от пороговой стадии и выше',
        description:
            'Открытые сделки воронки «ОП Основная» от стадии «Презентация» или ' +
            '«Документы» (параметр threshold) и выше: суммы, месячная сумма, ' +
            '«ОП История», комментарии. Живые данные — короткий кэш; при промахе ' +
            'результат приходит по WS событием sales-finance:hot-clients:done.',
    })
    @ApiBody({ type: HotClientsRequestDto })
    @ApiOkResponse({ type: HotClientsResponseDto })
    async getHotClients(
        @Body() dto: HotClientsRequestDto,
    ): Promise<HotClientsResponseDto> {
        const forceRefresh = dto.forceRefresh === true;
        const cacheKey = buildHotClientsKey(
            dto.domain,
            dto.threshold,
            dto.assignedIds,
        );

        if (!forceRefresh) {
            const cached =
                await this.cache.getJson<HotClientsReportDto>(cacheKey);
            if (cached) return { status: 'ready', data: cached };
        }

        const jobData: HotClientsJobData = {
            domain: dto.domain,
            socketId: dto.socketId,
            forceRefresh,
            threshold: dto.threshold,
            assignedIds: dto.assignedIds,
        };
        // jobId = ключ кэша (домен внутри) — дедуп повторных кликов.
        await this.queue.dispatch(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_FINANCE_HOT_CLIENTS,
            jobData,
            cacheKey,
            { removeOnComplete: true, removeOnFail: true },
        );
        return { status: 'queued' };
    }

    @Post('cache/reset')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сброс кэша финансовой аналитики по домену',
        description:
            'Удаляет ключи кэша модуля по SCAN-паттерну: scope=closed — закрытые ' +
            'продажи, scope=hot — горячие клиенты, scope=all (по умолчанию) — всё.',
    })
    @ApiBody({ type: SalesFinanceCacheResetRequestDto })
    @ApiOkResponse({ type: SalesFinanceCacheResetResponseDto })
    async resetCache(
        @Body() dto: SalesFinanceCacheResetRequestDto,
    ): Promise<SalesFinanceCacheResetResponseDto> {
        const pattern = buildResetPattern(dto.domain, dto.scope ?? 'all');
        const deletedCount = await this.cache.resetByPattern(pattern);
        return { deletedCount, pattern };
    }
}
