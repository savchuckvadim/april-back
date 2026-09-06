/**
 * Сборка матрицы менеджер × тип из lite-строк (план §4.3, §6.3): строки →
 * MatrixCallRow (чек-листы «Хвост»/«5К» подхватываются, если loader их
 * когда-нибудь отдаст), buildManagerTypeMatrix, buildObjectionsSlice,
 * итоги по отделам той же функцией матрицы на подмножестве строк.
 * Чистые детерминированные функции.
 */
import {
    bucketOfCallType,
    buildManagerTypeMatrix,
    buildObjectionsSlice,
    ManagerTypeMatrix,
    MatrixCallRow,
    MatrixOptions,
    ObjectionsSlice,
    TypeTotalsCell,
} from '@lib/sales-ai-analytics';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type { ManagerOrg } from '../loaders/manager-org.loader';

export interface MatrixAssembly {
    matrix: ManagerTypeMatrix;
    objections: ObjectionsSlice;
    /** Доля other + irrelevant среди разобранных сравнимых звонков, %. */
    otherSharePct: number;
}

export interface DepartmentTotals {
    departmentId: number | null;
    managerIds: string[];
    totals: TypeTotalsCell[];
}

/** Lite-строка с известными булевыми чек-листами презентации. */
type LiteRowWithChecklists = DatedLiteRow & {
    hvostDone?: boolean | null;
    fiveKDone?: boolean | null;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Lite-строка → строка матрицы. Флаги «Хвост»/«5К» в lite-выборке Фазы 1b
 * не приходят; если loader начнёт их отдавать — они попадут в чек-листы
 * ячейки без правки assembler'а.
 */
export function toMatrixRow(row: DatedLiteRow): MatrixCallRow {
    const withFlags = row as LiteRowWithChecklists;
    return {
        ...row,
        ...(withFlags.hvostDone !== undefined
            ? { hvostDone: withFlags.hvostDone }
            : {}),
        ...(withFlags.fiveKDone !== undefined
            ? { fiveKDone: withFlags.fiveKDone }
            : {}),
    };
}

/** Доля строк без корзины среди разобранных сравнимых, %. */
export function otherSharePct(matrix: ManagerTypeMatrix): number {
    if (matrix.analyzed === 0) return 0;
    return round1((matrix.noBucket / matrix.analyzed) * 100);
}

export function assembleMatrix(
    rows: readonly DatedLiteRow[],
    options: MatrixOptions,
): MatrixAssembly {
    const matrixRows = rows.map(toMatrixRow);
    const matrix = buildManagerTypeMatrix(matrixRows, options);
    return {
        matrix,
        objections: buildObjectionsSlice(matrixRows, {
            shortCallSec: options.thresholds?.shortCallSec,
        }),
        otherSharePct: otherSharePct(matrix),
    };
}

/**
 * Итоги по типам в разрезе отделов продаж: менеджеры матрицы группируются
 * по departmentId раскладки (вне ростера → null), по каждой группе
 * матрица строится заново на её строках. Порядок — по departmentId,
 * null последним.
 */
export function assembleDepartmentTotals(
    rows: readonly DatedLiteRow[],
    managerIds: readonly string[],
    org: ReadonlyMap<number, ManagerOrg>,
    options: MatrixOptions,
): DepartmentTotals[] {
    const groups = new Map<number | null, string[]>();
    for (const managerId of managerIds) {
        const departmentId = org.get(Number(managerId))?.departmentId ?? null;
        const members = groups.get(departmentId) ?? [];
        members.push(managerId);
        groups.set(departmentId, members);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => {
            if (a === null) return 1;
            if (b === null) return -1;
            return a - b;
        })
        .map(([departmentId, members]) => {
            const memberSet = new Set(members);
            const subset = rows.filter(
                row => row.managerId !== null && memberSet.has(row.managerId),
            );
            return {
                departmentId,
                managerIds: [...members].sort((a, b) => Number(a) - Number(b)),
                totals: buildManagerTypeMatrix(subset.map(toMatrixRow), options)
                    .totals,
            };
        });
}

/** Тип участвует в корзинах (не other / irrelevant). */
export const hasBucket = (callType: string): boolean =>
    bucketOfCallType(callType) !== null;
