/**
 * Матрица «оценка звонка × продвижение сделки» (п. 3 постановки §7):
 * разобранные звонки периода с продвижением 1–5 раскладываются по полосе
 * оценки (низкая / средняя / высокая) и уровню продвижения. Клетки низкой
 * оценки при продвижении 4–5 — «клиент купил бы и без менеджера». Мало
 * звонков — число и пометка, без «стены». Чистые функции.
 */
import { DEAL_MOVEMENT_PROGRESS_CHECK_MIN } from '@lib/sales-ai-analytics';
import {
    DEAL_MOVEMENT_FEW_CALLS,
    DEAL_MOVEMENT_PROGRESS_LEVELS,
    DEAL_MOVEMENT_SCORE_BAND_RULES,
    DEAL_MOVEMENT_SCORE_BANDS,
    DEAL_MOVEMENT_TEXTS,
    scoreBandOf,
    type DealMovementCellFlag,
    type DealMovementScoreBand,
} from './deal-movement-vitrina.const';
import type { DealMovementScope } from './deal-movement-scope';
import type { DealMovementCallPoint } from './deal-movement-vitrina.types';
import type {
    DealMovementMatrixBlockDto,
    DealMovementMatrixCellDto,
    DealMovementMatrixDto,
} from './dto/deal-movement-matrix.dto';

/** Пометка клетки: низкая оценка при продвижении 4–5. */
export function cellFlagOf(
    band: DealMovementScoreBand,
    progress: number,
): DealMovementCellFlag | null {
    return band === 'low' && progress >= DEAL_MOVEMENT_PROGRESS_CHECK_MIN
        ? 'buy_anyway'
        : null;
}

const cellKey = (band: DealMovementScoreBand, progress: number): string =>
    `${band}:${progress}`;

/** Матрица по звонкам с оценкой: все 15 клеток, пустые — с нулём. */
export function buildDealMovementMatrix(
    calls: readonly DealMovementCallPoint[],
): DealMovementMatrixDto {
    const counts = new Map<string, number>();
    let n = 0;
    for (const call of calls) {
        if (call.score === null) continue;
        const key = cellKey(scoreBandOf(call.score), call.progress);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        n += 1;
    }
    const cells: DealMovementMatrixCellDto[] = [];
    let buyAnyway = 0;
    for (const band of DEAL_MOVEMENT_SCORE_BANDS) {
        for (const progress of DEAL_MOVEMENT_PROGRESS_LEVELS) {
            const count = counts.get(cellKey(band, progress)) ?? 0;
            const flag = cellFlagOf(band, progress);
            if (flag !== null) buyAnyway += count;
            cells.push({
                scoreBand: band,
                progress,
                count,
                flag,
                flagTitle: flag === null ? null : DEAL_MOVEMENT_TEXTS.buyAnyway,
            });
        }
    }
    const fewCalls = n < DEAL_MOVEMENT_FEW_CALLS.matrix;
    return {
        n,
        cells,
        buyAnyway,
        fewCalls,
        note: fewCalls ? DEAL_MOVEMENT_TEXTS.fewCalls : null,
    };
}

/** Звонки по менеджерам (только с менеджером). */
export function callsByManager(
    calls: readonly DealMovementCallPoint[],
): Map<string, DealMovementCallPoint[]> {
    const byManager = new Map<string, DealMovementCallPoint[]>();
    for (const call of calls) {
        if (call.managerId === null) continue;
        const list = byManager.get(call.managerId) ?? [];
        list.push(call);
        byManager.set(call.managerId, list);
    }
    return byManager;
}

/** Блок матрицы: видимые звонки периода по отделу и менеджерам. */
export function presentDealMovementMatrix(input: {
    calls: readonly DealMovementCallPoint[];
    scope: DealMovementScope;
    names: Readonly<Record<string, string>>;
}): DealMovementMatrixBlockDto {
    const visible = input.calls.filter(call =>
        input.scope.visible(call.managerId),
    );
    const managers = [...callsByManager(visible).entries()]
        .map(([managerId, calls]) => ({
            managerId,
            managerName: input.names[managerId] ?? null,
            ...buildDealMovementMatrix(calls),
        }))
        .sort((a, b) => b.n - a.n || Number(a.managerId) - Number(b.managerId));
    return {
        bands: DEAL_MOVEMENT_SCORE_BANDS.map(code => ({
            code,
            ...DEAL_MOVEMENT_SCORE_BAND_RULES[code],
        })),
        progressLevels: [...DEAL_MOVEMENT_PROGRESS_LEVELS],
        noScore: visible.filter(call => call.score === null).length,
        department: buildDealMovementMatrix(visible),
        managers,
    };
}
