import {
    isReportViewLabelKey,
    REPORT_VIEW_LABEL_PREFIXES,
    reportViewLabelKey,
    type ReportViewLabelPrefix,
} from '@lib/portal-lib/store/app-settings';
import {
    PLAN_INDICATORS,
    type PlanFactSource,
    type PlanIndicatorDef,
} from '../plans';
import { CALLING_TYPES, type ReportEventColumn } from '../report';
import type { PortalViewIndicator } from './portal-view.types';

/**
 * Каталог показателей портала для страницы «Настройки отчёта»: что можно
 * переименовать и какие планы можно вывести колонкой. Ключи — только коды
 * (`ev:`, `call:`, `plan:`), названия — для показа.
 */

/**
 * Откуда берётся факт плана → приставка ключа показателя-факта (ключи
 * прижаты к PlanFactSource). Колонкой выводятся только планы с фактом в
 * таблицах событий и звонков; финансов и эфирного времени в этих таблицах
 * нет.
 */
const PLAN_FACT_PREFIXES: Partial<
    Record<PlanFactSource, ReportViewLabelPrefix>
> = {
    kpi: REPORT_VIEW_LABEL_PREFIXES.event,
    calling: REPORT_VIEW_LABEL_PREFIXES.calling,
};

/** Плановые показатели, которые можно вывести колонкой (факт — события или звонки). */
export const PLAN_COLUMN_INDICATORS: readonly PlanIndicatorDef[] =
    PLAN_INDICATORS.filter(
        indicator => PLAN_FACT_PREFIXES[indicator.factSource] !== undefined,
    );

/** Название для показа: пробелы по краям убраны, повторные схлопнуты. */
export function cleanIndicatorName(name: string): string {
    return name.replace(/\s+/g, ' ').trim();
}

/** Ключ показателя-факта плана (`ev:<innerCode>` или `call:<id>`); null — не колонка. */
export function planFactKey(indicator: PlanIndicatorDef): string | null {
    const prefix = PLAN_FACT_PREFIXES[indicator.factSource];
    return prefix === undefined
        ? null
        : reportViewLabelKey(prefix, indicator.factKey);
}

/** Колонки событий в порядке отчёта, без повторов ключа. */
function eventIndicators(
    columns: readonly ReportEventColumn[],
): PortalViewIndicator[] {
    const seen = new Set<string>();
    return columns.flatMap(column => {
        const key = reportViewLabelKey(
            REPORT_VIEW_LABEL_PREFIXES.event,
            column.innerCode,
        );
        if (seen.has(key) || !isReportViewLabelKey(key)) return [];
        seen.add(key);
        return [
            {
                key,
                group: 'events' as const,
                name: cleanIndicatorName(column.name),
                factKey: null,
            },
        ];
    });
}

/** Бакеты звонков: ключ `call:<id>`, название — как в таблице звонков. */
function callingIndicators(): PortalViewIndicator[] {
    return CALLING_TYPES.map(type => ({
        key: reportViewLabelKey(REPORT_VIEW_LABEL_PREFIXES.calling, type.id),
        group: 'callings' as const,
        name: type.action,
        factKey: null,
    }));
}

/**
 * Каталог: события портала (в порядке отчёта), бакеты звонков, затем
 * колонки планов. План, чьего факта нет среди событий и звонков портала,
 * в каталог не входит: колонку ему поставить некуда.
 */
export function buildIndicatorCatalog(
    eventColumns: readonly ReportEventColumn[],
): PortalViewIndicator[] {
    const facts = [...eventIndicators(eventColumns), ...callingIndicators()];
    const known = new Set(facts.map(indicator => indicator.key));
    const plans = PLAN_COLUMN_INDICATORS.flatMap(indicator => {
        const factKey = planFactKey(indicator);
        if (factKey === null || !known.has(factKey)) return [];
        return [
            {
                key: reportViewLabelKey(
                    REPORT_VIEW_LABEL_PREFIXES.plan,
                    indicator.code,
                ),
                group: 'plans' as const,
                name: indicator.defaultName,
                factKey,
            },
        ];
    });
    return [...facts, ...plans];
}
