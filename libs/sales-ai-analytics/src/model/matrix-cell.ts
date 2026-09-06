import { MetricValue, scoreMetric } from './metric';
import { ratePctMetric } from './metric-pct.util';
import {
    EvidenceCallIds,
    MatrixCallRow,
    MatrixCellCore,
    MatrixChecklists,
    MatrixSectionAggregate,
} from './matrix.types';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/** Строка с оценкой разбора (score 0–100 не null). */
export type ScoredRow = MatrixCallRow & { score: number };

/** Guard обобщённый, чтобы сужать и подтипы строки (менеджер/тип известны). */
export const hasScore = <T extends MatrixCallRow>(
    row: T,
): row is T & { score: number } =>
    row.score !== null && Number.isFinite(row.score);

/** Оценка звонка в шкале 1–10: weightedScore/10 (план §2.2). */
export const callScore10 = (row: { score: number }): number => row.score / 10;

/** Следующий шаг назначен и у него есть дата. */
export const hasNextStepDate = (row: MatrixCallRow): boolean =>
    row.nextStep?.set === true &&
    row.nextStep.date !== null &&
    row.nextStep.date !== '';

const mean = (values: readonly number[]): number =>
    values.reduce((acc, value) => acc + value, 0) / values.length;

/** Выборочное стандартное отклонение (n − 1); null при n < 2. */
function sampleSd(values: readonly number[]): number | null {
    if (values.length < 2) {
        return null;
    }
    const avg = mean(values);
    const variance =
        values.reduce((acc, value) => acc + (value - avg) ** 2, 0) /
        (values.length - 1);
    return Math.sqrt(variance);
}

const compareScoreAsc = (a: ScoredRow, b: ScoredRow): number =>
    a.score - b.score || a.transcriptionId.localeCompare(b.transcriptionId);

/**
 * Три опорных звонка: лучший (наибольшая оценка, при равенстве — меньший
 * id), худший (наименьшая) и медианный (нижняя медиана по возрастанию).
 */
export function pickEvidence(rows: readonly MatrixCallRow[]): EvidenceCallIds {
    const ascending = rows.filter(hasScore).sort(compareScoreAsc);
    if (ascending.length === 0) {
        return { best: null, worst: null, median: null };
    }
    const descending = [...ascending].sort(
        (a, b) =>
            b.score - a.score ||
            a.transcriptionId.localeCompare(b.transcriptionId),
    );
    return {
        best: descending[0].transcriptionId,
        worst: ascending[0].transcriptionId,
        median: ascending[Math.floor((ascending.length - 1) / 2)]
            .transcriptionId,
    };
}

/**
 * Разделы рубрики с собственным n: учитываются только записи с
 * relevance > 0 и оценкой; avgScore = null при n < scoreNone.
 * Порядок — по коду раздела.
 */
export function aggregateSections(
    rows: readonly MatrixCallRow[],
): MatrixSectionAggregate[] {
    const groups = new Map<string, { scores: number[]; relevance: number[] }>();
    for (const row of rows) {
        for (const section of row.sections) {
            if (section.relevance <= 0 || section.score === null) {
                continue;
            }
            const group = groups.get(section.section) ?? {
                scores: [],
                relevance: [],
            };
            group.scores.push(section.score);
            group.relevance.push(section.relevance);
            groups.set(section.section, group);
        }
    }
    return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([section, group]) => ({
            section,
            n: group.scores.length,
            avgScore:
                group.scores.length >= AI_ANALYTICS_THRESHOLDS.scoreNone
                    ? mean(group.scores)
                    : null,
            avgRelevance: mean(group.relevance),
        }));
}

/** Доля булевого чек-листа среди строк, где он заполнен; нет строк → undefined. */
function flagRatePct(
    rows: readonly MatrixCallRow[],
    pick: (row: MatrixCallRow) => boolean | null | undefined,
): MetricValue | undefined {
    const known = rows.filter(row => typeof pick(row) === 'boolean');
    if (known.length === 0) {
        return undefined;
    }
    return ratePctMetric(
        known.filter(row => pick(row) === true).length,
        known.length,
    );
}

export function buildChecklists(
    rows: readonly MatrixCallRow[],
): MatrixChecklists {
    const checklists: MatrixChecklists = {
        nextStepDateRatePct: ratePctMetric(
            rows.filter(hasNextStepDate).length,
            rows.length,
        ),
    };
    const hvost = flagRatePct(rows, row => row.hvostDone);
    const fiveK = flagRatePct(rows, row => row.fiveKDone);
    if (hvost) {
        checklists.hvostDonePct = hvost;
    }
    if (fiveK) {
        checklists.fiveKDonePct = fiveK;
    }
    return checklists;
}

/** Сигнатура версий разбора строки: канонический JSON по ключам. */
export function versionsSignature(row: MatrixCallRow): string {
    if (row.versions === null) {
        return 'none';
    }
    const keys = Object.keys(row.versions).sort();
    return JSON.stringify(keys.map(key => [key, row.versions?.[key] ?? '']));
}

/**
 * Ядро ячейки по сравнимым разобранным строкам: оценка (среднее S/10 при
 * n ≥ 8), разделы, чек-листы, опорные звонки и признак смешанных версий.
 */
export function buildCellCore(
    rows: readonly MatrixCallRow[],
    nBeforeComparable: number,
): MatrixCellCore {
    const scores = rows.filter(hasScore).map(callScore10);
    const score = scoreMetric(scores);
    return {
        n: rows.length,
        nBeforeComparable,
        score,
        scoreSd: score.value === null ? null : sampleSd(scores),
        sections: aggregateSections(rows),
        checklists: buildChecklists(rows),
        evidenceCallIds: pickEvidence(rows),
        versionsMixed: new Set(rows.map(versionsSignature)).size > 1,
    };
}
