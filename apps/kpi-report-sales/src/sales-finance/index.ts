export { SalesFinanceModule } from './sales-finance.module';

// Публичный API фичи для соседних модулей (план AI-аналитики, 6.1):
// use-case'ы non-injectable (`new ClosedSalesUseCase(pbx, cache)`), кэш
// модуля и типы результатов. Кросс-импорты `../sales-finance/domain/*`
// запрещены — только через этот index.
export { ClosedSalesUseCase } from './domain/use-cases/closed-sales.use-case';
export { HotClientsUseCase } from './domain/use-cases/hot-clients.use-case';
export { SalesFinanceCacheService } from './cache/sales-finance-cache.service';
export {
    SALES_HOT_THRESHOLDS,
    SALES_HOT_THRESHOLD_STAGE_CODE,
} from './constants/sales-finance.const';
export type { SalesHotThreshold } from './constants/sales-finance.const';
export type {
    ClosedSalesJobData,
    HotClientsJobData,
} from './dto/sales-finance-job.dto';
export type {
    ClosedSalesDealDto,
    ClosedSalesEmployeeDto,
    ClosedSalesReportDto,
    ClosedSalesTotalsDto,
} from './dto/closed-sales-response.dto';
export type {
    HotClientDealDto,
    HotClientsReportDto,
    HotClientsTotalsDto,
} from './dto/hot-clients-response.dto';
