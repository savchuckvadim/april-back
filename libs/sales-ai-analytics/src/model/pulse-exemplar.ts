import type { PulseCallRow } from './pulse.types';

/*
 * Звонок-образец блока «С кем поработать». До 09.11.2026 образцом был
 * просто самый свежий звонок менеджера с договорённостью и датой — при
 * «1 из 11 с датой» он ничего не показывал. Решение владельца 09.11.2026:
 * у образца должна быть реально высокая оценка или выше средней.
 */

/**
 * Нижняя планка общей оценки образца по шкале lite-строки 0–100 (7 из 10).
 * Не параметр реестра.
 */
export const PULSE_EXEMPLAR_MIN_SCORE = 70;

const scoreOf = (row: PulseCallRow): number | null =>
    typeof row.score === 'number' && Number.isFinite(row.score)
        ? row.score
        : null;

/**
 * Средняя общая оценка разборов (0–100); строки без оценки не считаются,
 * оценок нет — null.
 */
export function meanScoreOf(rows: readonly PulseCallRow[]): number | null {
    const scores = rows
        .map(scoreOf)
        .filter((score): score is number => score !== null);
    if (scores.length === 0) return null;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/**
 * Звонок-образец среди кандидатов (звонки с договорённостью и датой, свежие
 * первыми): с лучшей общей оценкой разбора, при равной — более свежий.
 * Образец только если оценка не ниже PULSE_EXEMPLAR_MIN_SCORE или выше
 * средней meanScore; звонок без оценки образцом не бывает.
 */
export function exemplarCallId(
    candidates: readonly PulseCallRow[],
    meanScore: number | null,
): string | null {
    let best: { id: string; score: number } | null = null;
    for (const row of candidates) {
        const score = scoreOf(row);
        if (score === null) continue;
        if (best === null || score > best.score) {
            best = { id: row.transcriptionId, score };
        }
    }
    if (best === null) return null;
    const qualifies =
        best.score >= PULSE_EXEMPLAR_MIN_SCORE ||
        (meanScore !== null && best.score > meanScore);
    return qualifies ? best.id : null;
}
