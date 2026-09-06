/**
 * Факты по звонкам менеджера вне матрицы (для строки обзора и «Внимания»):
 * всего звонков в телефонии, риск-звонки (риск-флаг разбора / срочный
 * коучинг), доля «шаг с датой» за два последних окна периода, доля
 * отработанных возражений. Чистые функции над lite-строками.
 */
import {
    AI_ANALYTICS_THRESHOLDS,
    hasNextStepDate,
    MetricValue,
    rateMetric,
    ratePctMetric,
    shiftDate,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_ATTENTION_WINDOW_DAYS } from '../../constants/ai-overview.const';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import { resolveAlertKind } from '../presenter/pulse-alerts.util';
import type {
    ManagerCallFacts,
    ManagerNextStepRates,
    ManagerRiskCall,
} from './overview-model.types';

export interface CallFactsOptions {
    /** Конец периода YYYY-MM-DD (TZ портала). */
    to: string;
    timeZone: string;
    /** Окно доли «шаг с датой», дней (по умолчанию 14). */
    windowDays?: number;
    /** Звонок короче — вне слоя качества (по умолчанию shortCallSec). */
    shortCallSec?: number;
}

/** Разобранный звонок слоя качества: разбор есть и не короткий. */
const isQualityRow = (row: DatedLiteRow, shortCallSec: number): boolean =>
    row.analysisPresent &&
    (row.durationSec === null || row.durationSec >= shortCallSec);

/** Доля «шаг с датой» среди разобранных звонков в окне дней портала. */
function windowRate(
    rows: readonly DatedLiteRow[],
    from: string,
    to: string,
    timeZone: string,
): MetricValue {
    const inWindow = rows.filter(row => {
        const day = toPortalDate(row.callStartedAt, timeZone);
        return day >= from && day <= to;
    });
    return rateMetric(inWindow.filter(hasNextStepDate).length, inWindow.length);
}

/** Текущее окно — последние windowDays дней периода, предыдущее — перед ним. */
export function nextStepWindows(
    to: string,
    windowDays: number,
): { current: [string, string]; previous: [string, string] } {
    const currentFrom = shiftDate(to, -(windowDays - 1));
    return {
        current: [currentFrom, to],
        previous: [
            shiftDate(currentFrom, -windowDays),
            shiftDate(currentFrom, -1),
        ],
    };
}

function toNextStepRates(
    qualityRows: readonly DatedLiteRow[],
    options: CallFactsOptions,
    windowDays: number,
): ManagerNextStepRates {
    const { current, previous } = nextStepWindows(options.to, windowDays);
    return {
        windowDays,
        current: windowRate(
            qualityRows,
            current[0],
            current[1],
            options.timeZone,
        ),
        previous: windowRate(
            qualityRows,
            previous[0],
            previous[1],
            options.timeZone,
        ),
    };
}

function toRiskCalls(rows: readonly DatedLiteRow[]): ManagerRiskCall[] {
    return rows
        .flatMap(row => {
            const kind = resolveAlertKind(row);
            return kind
                ? [
                      {
                          transcriptionId: row.transcriptionId,
                          kind,
                          callStartedAt: row.callStartedAt.toISOString(),
                      },
                  ]
                : [];
        })
        .sort(
            (a, b) =>
                a.callStartedAt.localeCompare(b.callStartedAt) ||
                a.transcriptionId.localeCompare(b.transcriptionId),
        );
}

/** Доля handled = true среди возражений с известным handled, %; нет — null. */
function toHandledRatePct(
    qualityRows: readonly DatedLiteRow[],
): MetricValue | null {
    const known = qualityRows.flatMap(row =>
        row.objections.filter(objection => objection.handled !== null),
    );
    if (known.length === 0) return null;
    return ratePctMetric(
        known.filter(objection => objection.handled === true).length,
        known.length,
    );
}

/** Факты по каждому менеджеру, у которого есть хотя бы один звонок. */
export function assembleCallFacts(
    rows: readonly DatedLiteRow[],
    options: CallFactsOptions,
): Map<string, ManagerCallFacts> {
    const shortCallSec =
        options.shortCallSec ?? AI_ANALYTICS_THRESHOLDS.shortCallSec;
    const windowDays = options.windowDays ?? AI_ANALYTICS_ATTENTION_WINDOW_DAYS;
    const byManager = new Map<string, DatedLiteRow[]>();
    for (const row of rows) {
        if (row.managerId === null || row.managerId === '') continue;
        const list = byManager.get(row.managerId) ?? [];
        list.push(row);
        byManager.set(row.managerId, list);
    }
    return new Map(
        [...byManager.entries()].map(([managerId, managerRows]) => {
            const quality = managerRows.filter(row =>
                isQualityRow(row, shortCallSec),
            );
            return [
                managerId,
                {
                    managerId,
                    callsTotal: managerRows.length,
                    riskCalls: toRiskCalls(quality),
                    nextStepRate: toNextStepRates(quality, options, windowDays),
                    handledRatePct: toHandledRatePct(quality),
                },
            ];
        }),
    );
}

/** Пустые факты для менеджера без звонков в периоде. */
export function emptyCallFacts(
    managerId: string,
    windowDays = AI_ANALYTICS_ATTENTION_WINDOW_DAYS,
): ManagerCallFacts {
    return {
        managerId,
        callsTotal: 0,
        riskCalls: [],
        nextStepRate: {
            windowDays,
            current: rateMetric(0, 0),
            previous: rateMetric(0, 0),
        },
        handledRatePct: null,
    };
}
