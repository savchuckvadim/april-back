import type { OwnerReportPeriodKind } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_CACHE_PREFIX,
    AI_ANALYTICS_CACHE_SECTIONS,
} from '../constants/ai-analytics.const';
import { AI_OWNER_REPORT_KEY_VERSION } from './owner-report.const';

/**
 * Ключ кэша и jobId отчёта собственнику:
 * `sales-ai-analytics:v1:{domain}:owner-report:v2:{kind}:{periodKey}`.
 * Один период — один ключ: повторный запрос подписывается на идущий расчёт.
 */
export function buildOwnerReportKey(
    domain: string,
    kind: OwnerReportPeriodKind,
    periodKey: string,
): string {
    return [
        AI_ANALYTICS_CACHE_PREFIX,
        domain,
        AI_ANALYTICS_CACHE_SECTIONS.OWNER_REPORT,
        AI_OWNER_REPORT_KEY_VERSION,
        kind,
        periodKey,
    ].join(':');
}
