/**
 * Факты месячного снапшота менеджера (план §3.1, поток 14b): KPI-вектор,
 * оценки по типам звонков, рабочие дни, финансовый хвост и уровень.
 *
 * Вынесено из `manager-month.assembler.ts` намеренно: ассемблер месяца
 * легко перерастает 300 строк, поэтому экспозиция, рёбра и факты живут
 * отдельными файлами, а ассемблер только собирает из них нагрузку.
 * Чистые функции.
 */
import type {
    ManagerMatrixRow,
    ManagerTypeFact,
    ManagerWorkdaysFacts,
} from '@lib/sales-ai-analytics';
import type { AiManagerLevelSetting } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import {
    AI_ANALYTICS_DEFAULT_LEVEL,
    AI_ANALYTICS_JUNIOR_TENURE_MONTHS,
    AiAnalyticsLevelSource,
    AiAnalyticsManagerLevel,
} from '../../constants/ai-overview.const';
import type {
    AiFinanceManagerMonth,
    AiFinancePipelineFacts,
} from '../loaders/finance.types';
import type { AiKpiManagerMonth } from '../loaders/kpi.types';
import { monthsBetween } from '../presenter/level.util';
import type {
    ManagerExposureFacts,
    ManagerFinanceMonthFacts,
    ManagerPassportFacts,
    ManagerPipelineFacts,
} from './manager-snapshot.types';

/**
 * Коды KPI-вектора месяца: пары «план/факт» kpi-report и документные
 * события. Порядок фиксирован — вектор сравнивается между месяцами.
 */
export const AI_MONTH_KPI_CODES = [
    'call_plan',
    'call_done',
    'presentation_plan',
    'presentation_done',
    'presentation_uniq_plan',
    'presentation_uniq_done',
    'presentation_contact_uniq_done',
    'offer_act_send',
    'offer_act_send_after_presentation',
    'invoice_act_send',
    'invoice_act_send_after_presentation',
    'contract_act_send',
    'success_done',
    'fail_done',
] as const;
export type AiMonthKpiCode = (typeof AI_MONTH_KPI_CODES)[number];

/** KPI-вектор месяца: код показателя → факт (нет строки KPI → нули). */
export function buildKpiVector(
    month: AiKpiManagerMonth | undefined,
): Record<string, number> {
    const values: Record<AiMonthKpiCode, number> = {
        call_plan: month?.calls.plan ?? 0,
        call_done: month?.calls.done ?? 0,
        presentation_plan: month?.presentations.plan ?? 0,
        presentation_done: month?.presentations.done ?? 0,
        presentation_uniq_plan: month?.presentationsUniq.plan ?? 0,
        presentation_uniq_done: month?.presentationsUniq.done ?? 0,
        presentation_contact_uniq_done:
            month?.presentationsContactUniq.done ?? 0,
        offer_act_send: month?.documents.offers ?? 0,
        offer_act_send_after_presentation:
            month?.documents.offersAfterPresentation ?? 0,
        invoice_act_send: month?.documents.invoices ?? 0,
        invoice_act_send_after_presentation:
            month?.documents.invoicesAfterPresentation ?? 0,
        contract_act_send: month?.documents.contracts ?? 0,
        success_done: month?.outcomes.success ?? 0,
        fail_done: month?.outcomes.fail ?? 0,
    };
    return values;
}

/** Оценки по типам звонков месяца из строки матрицы (порядок справочника). */
export function buildTypeFacts(
    row: ManagerMatrixRow | undefined,
): ManagerTypeFact[] {
    return (row?.byType ?? []).map(cell => ({
        callType: cell.callType,
        n: cell.n,
        score: cell.score,
    }));
}

/** Рабочие дни месяца из экспозиции: календарь, отработано, отсутствия. */
export function buildWorkdays(
    exposure: ManagerExposureFacts,
): ManagerWorkdaysFacts {
    return {
        calendar: exposure.dCalendar,
        worked: exposure.dMt,
        absences: Math.max(0, exposure.dCalendar - exposure.dMt),
    };
}

/** Средний чек закрытых продаж, ₽; продаж нет — null. */
export function averageCheckOf(
    salesSum: number,
    salesCount: number,
): number | null {
    return salesCount > 0
        ? Math.round((salesSum / salesCount) * 100) / 100
        : null;
}

/** Живой пайплайн менеджера в форме нагрузки снапшота. */
export function toManagerPipelineFacts(
    pipeline: AiFinancePipelineFacts,
): ManagerPipelineFacts {
    return {
        count: pipeline.pipelineFromStage.count,
        monthlyAmount: pipeline.pipelineFromStage.monthlyAmount,
        hot: pipeline.hotEvents,
        withOffer: pipeline.withOfferCount,
    };
}

/**
 * Финансовый хвост месяца. Суммы счетов ни ClosedSalesUseCase, ни KPI не
 * отдают — в снапшоте остаётся только их число из документных событий, а
 * `invoicesSumKnown: false` честно об этом говорит. Пайплайн относится к
 * моменту расчёта, поэтому у закрытого месяца его нет (`null`).
 */
export function buildFinanceFacts(
    month: AiFinanceManagerMonth | undefined,
    kpi: AiKpiManagerMonth | undefined,
    pipeline: AiFinancePipelineFacts | null,
): ManagerFinanceMonthFacts {
    const salesSum = month?.monthlyAmount ?? 0;
    const salesCount = month?.salesCount ?? 0;
    return {
        salesSum,
        salesCount,
        invoicesSum: 0,
        invoicesCount: kpi?.documents.invoices ?? 0,
        averageCheck: averageCheckOf(salesSum, salesCount),
        advanceSum: month?.advanceAmount ?? 0,
        expectedContractSum: month?.expectedContractAmount ?? 0,
        paidMonths: month?.paidMonths ?? 0,
        invoicesSumKnown: false,
        pipeline: pipeline === null ? null : toManagerPipelineFacts(pipeline),
    };
}

/** Уровень менеджера и его источник. */
export interface ManagerLevelFacts {
    level: AiAnalyticsManagerLevel;
    levelSource: AiAnalyticsLevelSource;
    tenureMonths: number | null;
}

const isManagerLevel = (value: string): value is AiAnalyticsManagerLevel =>
    value === 'junior' || value === 'middle' || value === 'senior';

/** Дефолт по стажу: короче AI_ANALYTICS_JUNIOR_TENURE_MONTHS → junior. */
function defaultByTenure(
    since: string | null,
    until: string,
): ManagerLevelFacts {
    const tenureMonths = since === null ? null : monthsBetween(since, until);
    const level: AiAnalyticsManagerLevel =
        tenureMonths !== null &&
        tenureMonths < AI_ANALYTICS_JUNIOR_TENURE_MONTHS
            ? 'junior'
            : AI_ANALYTICS_DEFAULT_LEVEL;
    return { level, levelSource: 'default', tenureMonths };
}

/**
 * Уровень месяца: назначенный руководителем (ключ `ai_analytics_levels`)
 * — `manual`; иначе уровень паспорта менеджера; иначе дефолт по стажу.
 * Паспорт даёт стаж без ручного ввода (поток 14a), поэтому его дата
 * используется, когда в записи уровня даты нет.
 */
export function buildLevelFacts(
    levels: readonly AiManagerLevelSetting[],
    passport: ManagerPassportFacts | null,
    managerId: string,
    until: string,
): ManagerLevelFacts {
    const setting = levels.find(item => String(item.managerId) === managerId);
    const since = setting?.since ?? passport?.since ?? null;
    if (setting) {
        return {
            level: setting.level,
            levelSource: 'manual',
            tenureMonths: since === null ? null : monthsBetween(since, until),
        };
    }
    if (passport !== null && passport.level !== null) {
        const level = passport.level;
        if (isManagerLevel(level)) {
            return {
                level,
                levelSource:
                    passport.levelSource === 'manual' ? 'manual' : 'default',
                tenureMonths:
                    passport.tenureMonths ??
                    defaultByTenure(since, until).tenureMonths,
            };
        }
    }
    return defaultByTenure(since, until);
}
