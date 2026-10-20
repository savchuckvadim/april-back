/**
 * Факты качества по звонкам менеджера для сигналов «Внимания» этапа 2
 * (решение владельца 19.10.2026, план ai/tasks/2026-10-19-ai-focus-plan.md):
 * по звонкам-презентациям — средние разделов «Выявление потребностей» и
 * «Презентация под потребности»; по доработке (refine / decision) — доля
 * возражений без отработки, доля следующих шагов без даты, средние
 * «Работа с возражениями» и «Закрытие разговора»; по всем звонкам — список
 * с общей оценкой не выше порога. Пороги — слой портала (реестр), они же
 * едут в строку обзора, чтобы правила читали кэш теми же числами.
 *
 * Шкала средних и оценок — 1–10 (score lite-строки 0–100 делится на 10).
 * Чистые функции над lite-строками слоя качества.
 */
import {
    ATTENTION_FOLLOWUP_SECTIONS,
    ATTENTION_PRESENTATION_SECTIONS,
    AttentionLowScoreCall,
    AttentionSectionMean,
    bucketOfCallType,
    isFollowupCallType,
    isPresentationCallType,
    nonEmptyText,
} from '@lib/sales-ai-analytics';
import type { AnalyticsLiteSection } from '@lib/call-lib';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type {
    AttentionThresholds,
    ManagerFollowupFacts,
    ManagerPresentationFacts,
    ManagerQualityFacts,
} from './overview-model.types';

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Оценённые разделы строки из заданного набора кодов (relevance > 0). */
const scoredSections = (
    row: DatedLiteRow,
    codes: readonly string[],
): (AnalyticsLiteSection & { score: number })[] =>
    row.sections.filter(
        (section): section is AnalyticsLiteSection & { score: number } =>
            codes.includes(section.section) &&
            section.relevance > 0 &&
            section.score !== null,
    );

/** Средние разделов по звонкам: только разделы, оценённые хотя бы раз. */
export function sectionMeansOf(
    rows: readonly DatedLiteRow[],
    codes: readonly string[],
): AttentionSectionMean[] {
    return codes.flatMap(code => {
        const scores = rows.flatMap(row =>
            scoredSections(row, [code]).map(section => section.score),
        );
        if (scores.length === 0) return [];
        const mean =
            scores.reduce((acc, score) => acc + score, 0) / scores.length;
        return [{ section: code, mean: round1(mean), n: scores.length }];
    });
}

/** Есть ли у звонка раздел из набора с оценкой не выше порога. */
const hasWeakSection = (
    row: DatedLiteRow,
    codes: readonly string[],
    max: number,
): boolean => scoredSections(row, codes).some(section => section.score <= max);

/** Следующий шаг назначен, а даты нет. */
const isNextStepWithoutDate = (row: DatedLiteRow): boolean =>
    row.nextStep?.set === true && nonEmptyText(row.nextStep.date) === null;

const sortedIds = (rows: readonly DatedLiteRow[]): string[] =>
    rows.map(row => row.transcriptionId).sort();

function presentationFactsOf(
    rows: readonly DatedLiteRow[],
    thresholds: AttentionThresholds,
): ManagerPresentationFacts {
    const presentations = rows.filter(row =>
        isPresentationCallType(row.callType),
    );
    return {
        n: presentations.length,
        sections: sectionMeansOf(
            presentations,
            ATTENTION_PRESENTATION_SECTIONS,
        ),
        weakCallIds: sortedIds(
            presentations.filter(row =>
                hasWeakSection(
                    row,
                    ATTENTION_PRESENTATION_SECTIONS,
                    thresholds.weakSectionScoreMax,
                ),
            ),
        ),
    };
}

function followupFactsOf(
    rows: readonly DatedLiteRow[],
    thresholds: AttentionThresholds,
): ManagerFollowupFacts {
    const followups = rows.filter(row => isFollowupCallType(row.callType));
    const known = followups.flatMap(row =>
        row.objections.filter(objection => objection.handled !== null),
    );
    const withStep = followups.filter(row => row.nextStep?.set === true);
    return {
        n: followups.length,
        objectionsKnown: known.length,
        objectionsUnhandled: known.filter(
            objection => objection.handled === false,
        ).length,
        nextStepSet: withStep.length,
        nextStepNoDate: withStep.filter(isNextStepWithoutDate).length,
        sections: sectionMeansOf(followups, ATTENTION_FOLLOWUP_SECTIONS),
        weakCallIds: sortedIds(
            followups.filter(
                row =>
                    row.objections.some(
                        objection => objection.handled === false,
                    ) ||
                    isNextStepWithoutDate(row) ||
                    hasWeakSection(
                        row,
                        ATTENTION_FOLLOWUP_SECTIONS,
                        thresholds.weakSectionScoreMax,
                    ),
            ),
        ),
    };
}

/**
 * Звонки с общей оценкой (1–10) не выше порога, по id. Типы вне корзин
 * (приглашение на мероприятие, «прочее») в среднюю оценку не входят —
 * и в сигнал о низких оценках тоже.
 */
function lowScoreCallsOf(
    rows: readonly DatedLiteRow[],
    thresholds: AttentionThresholds,
): AttentionLowScoreCall[] {
    return rows
        .flatMap(row => {
            if (row.score === null) return [];
            if (bucketOfCallType(row.callType) === null) return [];
            const score = round1(row.score / 10);
            return score <= thresholds.lowScoreCallMax
                ? [
                      {
                          transcriptionId: row.transcriptionId,
                          callType: row.callType,
                          score,
                      },
                  ]
                : [];
        })
        .sort((a, b) => a.transcriptionId.localeCompare(b.transcriptionId));
}

/** Факты качества менеджера по звонкам слоя качества (разбор есть, не короткий). */
export function assembleQualityFacts(
    rows: readonly DatedLiteRow[],
    thresholds: AttentionThresholds,
): ManagerQualityFacts {
    return {
        thresholds: { ...thresholds },
        presentation: presentationFactsOf(rows, thresholds),
        followup: followupFactsOf(rows, thresholds),
        lowScoreCalls: lowScoreCallsOf(rows, thresholds),
    };
}

/** Пустые факты качества (менеджер без звонков в периоде). */
export const emptyQualityFacts = (
    thresholds: AttentionThresholds,
): ManagerQualityFacts => assembleQualityFacts([], thresholds);
