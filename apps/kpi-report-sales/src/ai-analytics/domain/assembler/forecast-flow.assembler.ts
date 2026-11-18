/**
 * Прогноз менеджера «от презентаций» (метод `presentations-v2`, задача
 * 17.11.2026 `2026-11-17-forecast-fix-design.md`): вход менеджера по
 * подбору портала и слагаемые середины прогноза — от проведённых и от
 * новых презентаций.
 *
 * Подбор портала — `forecast-flow.portal.ts`. Математика — библиотека
 * (`flowTotals`, `managerSalesPerPresentation`,
 * `presentationFlowExpected`, `salesPaceRemainder`); здесь — раскладка
 * входов.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import {
    flowTotals,
    managerSalesPerPresentation,
    presentationFlowExpected,
    salesPaceRemainder,
} from '@lib/sales-ai-analytics';
import { byManagerMonth, monthPresentationsOf } from './forecast-flow.portal';
import type {
    ForecastFlowFacts,
    ForecastFlowManagerInput,
    PortalFlow,
} from './forecast-flow.types';
import type { ForecastBuildInput } from './forecast.types';
import type { PortalManagerMonth } from './portal-model.types';

export {
    departmentFlowMonths,
    flowHistoryKeys,
    flowParamsOf,
    forecastMonthKeys,
    monthPresentationsOf,
    portalFlowOf,
} from './forecast-flow.portal';

/** Сколько прошлых месяцев усредняем в запасном расчёте по продажам. */
const SALES_MEAN_MONTHS = 3;

/** Что нужно знать о менеджере для входа прогноза от презентаций. */
export interface ManagerFlowOptions {
    readonly managerId: string;
    /** Все загруженные месяцы: история подбора и месяц прогноза. */
    readonly months: readonly PortalManagerMonth[];
    readonly monthKey: string;
    readonly portal: PortalFlow;
    /** Прошедших рабочих дней месяца. */
    readonly daysElapsed: number;
    /**
     * Рабочих дней календаря портала в прошлом месяце — знаменатель темпа
     * в первый рабочий день (то же правило, что у воспроизведения).
     */
    readonly previousWorkdays: number;
    /** Темп презентаций в рабочий день; нет — по месяцу или прошлому. */
    readonly presentationsRate?: number;
    /** Презентаций с начала месяца; нет — из снимка месяца. */
    readonly presentationsDone?: number;
}

/** Средние продажи за три прошлых месяца, где менеджер есть в снимках. */
function salesMeanOf(
    own: ReadonlyMap<string, PortalManagerMonth>,
    keys: readonly string[],
): number | null {
    const recent = keys.slice(-SALES_MEAN_MONTHS).flatMap(key => {
        const month = own.get(key);
        return month === undefined ? [] : [Math.max(0, month.salesCount)];
    });

    return recent.length === 0
        ? null
        : recent.reduce((sum, sales) => sum + sales, 0) / recent.length;
}

/**
 * Темп прошлого месяца на рабочие дни календаря портала — то же правило,
 * что у воспроизведения (`presentationRateOf`); нет месяца — 0.
 */
function previousRateOf(
    previous: PortalManagerMonth | undefined,
    options: ManagerFlowOptions,
): number {
    return previous !== undefined && options.previousWorkdays > 0
        ? monthPresentationsOf(previous, options.portal.fit.entry) /
              options.previousWorkdays
        : 0;
}

/**
 * Доля продаж на презентацию для входа: портал презентации не отмечает —
 * 0 (от презентаций не считаем); у менеджера их нет в истории — доля
 * отдела (своей не из чего взять); иначе своя после усадки.
 */
function salesPerPresentationOf(
    fit: PortalFlow['fit'],
    marked: boolean,
    own: number,
): number {
    if (fit.status === 'not-applicable') return 0;

    return marked ? own : fit.q;
}

/**
 * Вход прогноза от презентаций по менеджеру. По своим продажам считается
 * менеджер, который презентации в истории не отмечал (продажи есть, а
 * презентаций нет), и все — когда их не отмечает портал. Презентации
 * текущего месяца у такого менеджера не теряются: они идут по доле
 * отдела (`flowForecastOf`).
 */
export function managerFlowInput(
    options: ManagerFlowOptions,
): ForecastFlowManagerInput {
    const { fit, keys } = options.portal;
    const own = new Map(
        [...byManagerMonth(options.months).values()]
            .filter(month => month.managerId === options.managerId)
            .map(month => [month.monthKey, month]),
    );
    const series = {
        presentations: keys.map(key =>
            monthPresentationsOf(own.get(key), fit.entry),
        ),
        sales: keys.map(key => Math.max(0, own.get(key)?.salesCount ?? 0)),
    };
    const share = managerSalesPerPresentation({
        totals: flowTotals(series, fit),
        portalQ: fit.q,
        kappa: options.portal.qKappa,
    });
    const marked = series.presentations.some(value => value > 0);
    const sold = series.sales.some(value => value > 0);
    const done =
        options.presentationsDone ??
        monthPresentationsOf(own.get(options.monthKey), fit.entry);
    const fallbackRate = previousRateOf(
        own.get(keys[keys.length - 1] ?? ''),
        options,
    );

    return {
        source:
            fit.status === 'not-applicable' || (!marked && sold)
                ? 'sales-history'
                : 'presentations',
        presentationsDone: done,
        presentationsRate:
            options.presentationsRate ??
            (options.daysElapsed > 0
                ? done / options.daysElapsed
                : fallbackRate),
        pastPresentations: [...series.presentations]
            .reverse()
            .slice(0, fit.kernel.length - 1),
        salesPerPresentation: salesPerPresentationOf(fit, marked, share.value),
        ownShare: marked ? share.w : 0,
        salesMean: salesMeanOf(own, keys),
    };
}

/** Слагаемые середины прогноза от презентаций и факты для снимка. */
export interface FlowForecast {
    readonly backlog: number;
    readonly fresh: number;
    readonly facts: ForecastFlowFacts;
}

/**
 * Ожидание остатка месяца: от проведённых и от новых презентаций. Если
 * менеджер презентации в истории не отмечал — от своих средних продаж на
 * долю оставшихся дней плюс презентации этого месяца по доле отдела;
 * если их не отмечает портал — только от своих продаж (доля 0).
 */
export function flowForecastOf(input: ForecastBuildInput): FlowForecast {
    const flow = input.manager.flow;
    const { fit } = input.flow;
    const bySales = flow.source === 'sales-history';
    const expected = presentationFlowExpected({
        q: flow.salesPerPresentation,
        kernel: fit.kernel,
        // Прошлые продажи «по продажам» уже в средних — их не удваиваем.
        pastPresentations: bySales ? [] : flow.pastPresentations,
        presentationsDone: flow.presentationsDone,
        presentationsRate: flow.presentationsRate,
        daysTotal: input.workdaysInMonth,
        daysRemaining: input.daysLeft,
    });
    const pace = bySales
        ? salesPaceRemainder(
              flow.salesMean,
              input.workdaysInMonth,
              input.daysLeft,
          )
        : 0;
    const backlog = pace + expected.backlog;
    const fresh = expected.fresh;

    return {
        backlog,
        fresh,
        facts: {
            source: flow.source,
            status: fit.status,
            reason: fit.reason,
            backlogExpected: backlog,
            freshExpected: fresh,
            presentationsDone: flow.presentationsDone,
            presentationsRate: flow.presentationsRate,
            salesPerPresentation: flow.salesPerPresentation,
            ownShare: flow.ownShare,
            sameMonthShare: fit.kernel[0] ?? 0,
            remainingShare: expected.remainingShare,
            pastPresentationsEffective: expected.pastEffective,
            salesMean: flow.salesMean,
            portalQ: fit.q,
            rho: fit.rho,
        },
    };
}
