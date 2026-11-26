export { ReportModule } from './report.module';

// Публичный API фичи для соседних модулей (план AI-аналитики, 6.1):
// use-case'ы non-injectable (new + init/ctor per-domain), кэш конвертов и
// построители ключей. Кросс-импорты `../report/use-cases/*` запрещены —
// только через этот index.
export { ReportKpiUseCase } from './use-cases/kpi-report.use-case';
export { CallingStatisticUseCase } from './use-cases/kpi-calling-statistic.use-case';
export { ReportResultCacheService } from './cache/report-result-cache.service';
export type { ReportResultEnvelope } from './cache/report-result-cache.service';
export {
    buildReportUsersKey,
    buildKpiReportResultKey,
    buildReportRequestKey,
} from './cache/report-cache-key.util';
export type { ReportGetFiltersDto } from './dto/kpi-report-request.dto';
// Колонки таблицы событий в порядке отчёта и бакеты звонков — для
// каталога показателей страницы «Настройки отчёта» (тот же расчёт, что у
// отчёта).
export {
    reportEventColumns,
    reportEventColumnsOfList,
} from './lib/report-actions.util';
export type { ReportEventColumn } from './lib/report-actions.util';
export { CALLING_TYPES } from './types/calling-statistic.type';
