/**
 * Месячный снапшот менеджера (`ai-analytics-manager-month`, план §3.1,
 * поток 14b): KPI-вектор, факты по типам звонков, экспозиция, финансы,
 * s/n рёбер с трактовкой, паспорт, снимок плана, профиль стиля и версии
 * расчёта с идентификатором модели портала.
 *
 * Что нельзя ломать:
 * - месяц замораживается 3-го числа следующего месяца: ночной прогон
 *   пересчитывать его не должен, иначе ряд норм «поедет» задним числом
 *   (решение принимает шаг — здесь только флаг `frozen`);
 * - экспозиция, рёбра и стиль собираются отдельными функциями (файл
 *   ассемблера обязан оставаться в пределах 300 строк);
 * - живой пайплайн относится к моменту расчёта, поэтому у закрытого
 *   месяца его нет.
 *
 * Чистая детерминированная функция: без DI, Bitrix и `new Date()`.
 */
import {
    buildManagerTypeMatrix,
    resolveNumberParam,
    type AiAbsence,
    type ManagerMatrixRow,
    type ParamContext,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { isMonthFrozen } from '../../constants/ai-manager-snapshot.const';
import type { AiAnalyticsPortalSettings } from '../loaders/settings.loader';
import type { AiFinanceResult } from '../loaders/finance.types';
import type { AiKpiMonth } from '../loaders/kpi.types';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import { toMatrixRow } from './manager-type-matrix.assembler';
import {
    buildManagerEdges,
    resolveMonthEstimand,
    type MonthEstimand,
} from './manager-month.edges';
import { buildManagerExposure } from './manager-month.exposure';
import {
    buildFinanceFacts,
    buildKpiVector,
    buildLevelFacts,
    buildTypeFacts,
    buildWorkdays,
} from './manager-month.facts';
import type {
    AiSnapshotMeta,
    ManagerExposureFacts,
    ManagerMonthPayload,
    ManagerPassportFacts,
    ManagerPlanSnapshot,
    ManagerSnapshotRow,
    ManagerStyleFacts,
} from './manager-snapshot.types';

export interface ManagerMonthInput {
    /** Месяц снапшота 'YYYY-MM'. */
    monthKey: string;
    /** День прогона 'YYYY-MM-DD' в TZ портала (по нему считается заморозка). */
    day: string;
    /** Ростер ОП строками (ключ снапшота — managerId строкой). */
    managerIds: readonly string[];
    calendar: WorkCalendar;
    timeZone: string;
    /** Звонки месяца: экспозиция и оценки по типам. */
    rows: readonly DatedLiteRow[];
    /** KPI-факты месяца; нет — вектор нулевой. */
    kpi: AiKpiMonth | undefined;
    /** Финансы периода; нет — нули без пайплайна. */
    finance: AiFinanceResult | undefined;
    settings: AiAnalyticsPortalSettings;
    registry: ParamContext;
    /** Паспорта из шины (ключ `passport`). */
    passports: ReadonlyMap<string, ManagerPassportFacts>;
    /** Снимок планов из шины (ключ `plans`). */
    plans: ReadonlyMap<string, ManagerPlanSnapshot>;
    /** Профили стиля из шины (ключ `style`). */
    styles: ReadonlyMap<string, ManagerStyleFacts>;
    /** Доля сцепки звонков со сделками, % (ключ `chain`). */
    chainSharePct: number;
    /** Порог короткого звонка, секунды; нет — дефолт матрицы. */
    shortCallSec?: number;
    /** Начало сравнимой истории 'YYYY-MM-DD'; null — ряд не рвался. */
    comparableFrom: string | null;
    meta: AiSnapshotMeta;
}

export interface ManagerMonthAssembly {
    monthKey: string;
    /** Месяц закрыт и заморожен на день прогона. */
    frozen: boolean;
    rows: ManagerSnapshotRow<ManagerMonthPayload>[];
    /** Трактовка рёбер месяца и её причина (в «Как считаем»). */
    estimand: MonthEstimand;
}

/** Отсутствия менеджера: настройки портала плюс личный слой. */
export function absencesOf(
    settings: AiAnalyticsPortalSettings,
    managerId: string,
): AiAbsence[] {
    return [
        ...(settings.absences[managerId] ?? []),
        ...(settings.managerParams[managerId]?.absences ?? []),
    ];
}

/**
 * Исключение менеджер-месяца из норм: к прокси-отсутствиям добавляется
 * решение руководителя (`excludeFromNorms` слоя менеджера) — стажёр или
 * наставник не должен тянуть норму отдела.
 */
function withManagerExclusion(
    exposure: ManagerExposureFacts,
    excluded: boolean | undefined,
): ManagerExposureFacts {
    if (excluded !== true || exposure.excludedFromNorms) return exposure;
    return {
        ...exposure,
        excludedFromNorms: true,
        excludeReason: 'manager-params',
    };
}

/** Строка матрицы менеджера за месяц (оценки по типам звонков). */
function matrixRowOf(
    matrix: readonly ManagerMatrixRow[],
    managerId: string,
): ManagerMatrixRow | undefined {
    return matrix.find(row => row.managerId === managerId);
}

/**
 * Нагрузки месячного снапшота по всем менеджерам ростера. Строка есть у
 * каждого менеджера: месяц — регулярный ряд, и пропуск в нём означал бы
 * «данных нет», а не «работы не было».
 */
export function buildManagerMonthPayload(
    input: ManagerMonthInput,
): ManagerMonthAssembly {
    const frozen = isMonthFrozen(input.monthKey, input.day);
    const estimand = resolveMonthEstimand(input.registry, input.chainSharePct);
    const matrix = buildManagerTypeMatrix(input.rows.map(toMatrixRow), {
        ...(input.shortCallSec === undefined
            ? {}
            : { thresholds: { shortCallSec: input.shortCallSec } }),
        ...(input.comparableFrom === null
            ? {}
            : { comparableFrom: input.comparableFrom }),
        timeZone: input.timeZone,
    });
    const financeMonth = input.finance?.months.find(
        month => month.month === input.monthKey,
    );
    const isCurrentMonth = input.monthKey === input.day.slice(0, 7);
    const absenceProxyMinRun = resolveNumberParam(
        'absence_proxy_min_run',
        input.registry,
    );
    const minWorkdaysMonth = resolveNumberParam(
        'min_workdays_month',
        input.registry,
    );

    const rows = input.managerIds.map(managerId => {
        const managerParams = input.settings.managerParams[managerId];
        const passport = input.passports.get(managerId) ?? null;
        const exposure = withManagerExclusion(
            buildManagerExposure({
                monthKey: input.monthKey,
                managerId,
                calendar: input.calendar,
                timeZone: input.timeZone,
                rows: input.rows,
                absences: absencesOf(input.settings, managerId),
                ...(managerParams?.fteShare === undefined
                    ? {}
                    : { fte: managerParams.fteShare }),
                ...(absenceProxyMinRun === undefined
                    ? {}
                    : { absenceProxyMinRun }),
                ...(minWorkdaysMonth === undefined ? {} : { minWorkdaysMonth }),
            }),
            managerParams?.excludeFromNorms,
        );
        const kpiRow = input.kpi?.managers.find(
            row => String(row.managerId) === managerId,
        );
        const financeRow = financeMonth?.managers.find(
            row => String(row.managerId) === managerId,
        );
        const pipeline =
            isCurrentMonth && input.finance
                ? (input.finance.pipeline.managers.find(
                      row => String(row.managerId) === managerId,
                  ) ?? null)
                : null;
        const level = buildLevelFacts(
            input.settings.levels,
            passport,
            managerId,
            input.day,
        );
        const payload: ManagerMonthPayload = {
            kpi: buildKpiVector(kpiRow),
            byType: buildTypeFacts(matrixRowOf(matrix.managers, managerId)),
            workdays: buildWorkdays(exposure),
            finance: buildFinanceFacts(financeRow, kpiRow, pipeline),
            edges: buildManagerEdges(kpiRow, estimand.estimand),
            exposure,
            level: level.level,
            levelSource: level.levelSource,
            passport,
            planSnapshot: input.plans.get(managerId) ?? null,
            style: input.styles.get(managerId) ?? null,
            frozen,
            meta: input.meta,
        };
        return { managerId, payload };
    });

    return { monthKey: input.monthKey, frozen, rows, estimand };
}
