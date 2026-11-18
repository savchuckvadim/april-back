/**
 * Подбор прогноза «от презентаций» на портал (метод `presentations-v2`,
 * задача 17.11.2026 `2026-11-17-forecast-fix-design.md`): параметры из
 * реестра, месяцы истории, ряд отдела из снимков менеджеров и подбор
 * доли продаж на презентацию и сдвига.
 *
 * Подбор считается из загруженных месяцев, а не из снимка модели
 * портала: так воспроизведение любого месяца берёт только месяцы раньше
 * него и не зависит от того, есть ли подбор в старой модели.
 *
 * Математика — библиотека (`fitPresentationFlow`). Чистые функции: без DI,
 * Bitrix и `new Date()`.
 */
import {
    fitPresentationFlow,
    presentationsOf,
    resolveNumberParam,
    PRESENTATION_FLOW_DEFAULTS,
    PRESENTATION_FLOW_Q_KAPPA,
    type AiAnalyticsParamCode,
    type AiForecastEntry,
    type FlowMonth,
    type ParamContext,
    type PresentationFlowParams,
} from '@lib/sales-ai-analytics';
import { monthKeysBack } from '../../constants/ai-manager-snapshot.const';
import { previousMonthKey } from '../../constants/ai-snapshot.const';
import type { PortalFlow } from './forecast-flow.types';
import type { PortalManagerMonth } from './portal-model.types';

/** Параметры подбора из реестра портала; нет значения — дефолт реестра. */
export function flowParamsOf(registry: ParamContext): PresentationFlowParams {
    const number = (code: AiAnalyticsParamCode, fallback: number): number =>
        resolveNumberParam(code, registry) ?? fallback;
    const defaults = PRESENTATION_FLOW_DEFAULTS;

    return {
        maxLag: number('forecast_lag_max_months', defaults.maxLag),
        windowMonths: number(
            'forecast_flow_window_months',
            defaults.windowMonths,
        ),
        rhoDefault: number('forecast_lag_rho_default', defaults.rhoDefault),
        forgetLambda: number('forget_lambda', defaults.forgetLambda),
        minFitMonths: number(
            'forecast_flow_fit_min_months',
            defaults.minFitMonths,
        ),
        minPresentations: number(
            'forecast_flow_min_presentations',
            defaults.minPresentations,
        ),
        qMax: number('forecast_q_max', defaults.qMax),
    };
}

/** Месяцы подбора: W + K месяцев до `monthKey`, по возрастанию. */
export function flowHistoryKeys(
    monthKey: string,
    params: PresentationFlowParams,
): string[] {
    return monthKeysBack(
        previousMonthKey(`${monthKey}-01`),
        params.windowMonths + params.maxLag,
    );
}

/**
 * Месяцы, которые нужно загрузить прогнозу месяца: история подбора и сам
 * месяц, не меньше `minCount` (воспроизведению нужны ещё среднее за три
 * месяца и прошлый месяц).
 */
export function forecastMonthKeys(
    monthKey: string,
    registry: ParamContext,
    minCount = 0,
): string[] {
    const params = flowParamsOf(registry);

    return monthKeysBack(
        monthKey,
        Math.max(minCount, params.windowMonths + params.maxLag + 1),
    );
}

/** Строки месяцев: по одной на менеджер-месяц (последняя побеждает). */
export function byManagerMonth(
    months: readonly PortalManagerMonth[],
): Map<string, PortalManagerMonth> {
    return new Map(
        months.map(month => [
            `${month.monthKey}\u0000${month.managerId}`,
            month,
        ]),
    );
}

/** Значение выбранного счётчика презентаций в снимке менеджера. */
export const monthPresentationsOf = (
    month: PortalManagerMonth | undefined,
    entry: AiForecastEntry,
): number =>
    month === undefined
        ? 0
        : presentationsOf(
              {
                  presentationsUniq: month.presentations,
                  presentations: month.presentationsAll ?? 0,
              },
              entry,
          );

/** Месяцы отдела по ключам: суммы по всем менеджерам снимков. */
export function departmentFlowMonths(
    months: readonly PortalManagerMonth[],
    keys: readonly string[],
): FlowMonth[] {
    const rows = [...byManagerMonth(months).values()];

    return keys.map(monthKey => {
        const own = rows.filter(month => month.monthKey === monthKey);
        const sum = (read: (month: PortalManagerMonth) => number): number =>
            own.reduce((total, month) => total + Math.max(0, read(month)), 0);

        return {
            monthKey,
            known: own.length > 0,
            presentationsUniq: sum(month => month.presentations),
            presentations: sum(month => month.presentationsAll ?? 0),
            sales: sum(month => month.salesCount),
        };
    });
}

/** Подбор портала на месяц `monthKey` — только по месяцам раньше него. */
export function portalFlowOf(
    months: readonly PortalManagerMonth[],
    monthKey: string,
    registry: ParamContext,
): PortalFlow {
    const params = flowParamsOf(registry);
    const keys = flowHistoryKeys(monthKey, params);

    return {
        fit: fitPresentationFlow(departmentFlowMonths(months, keys), params),
        keys,
        qKappa:
            resolveNumberParam('forecast_q_kappa', registry) ??
            PRESENTATION_FLOW_Q_KAPPA,
    };
}
