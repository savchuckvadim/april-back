/**
 * Обратная связь периода для обзора (вынесено из overview.use-case.ts по
 * лимиту 300 строк). Одна выборка по created_at записи: реакции disagree
 * и день выдачи советов — за период, «Сделано» — от начала периода до
 * «сейчас». Прошлый период смотрят и после его конца (сентябрь — 2
 * октября): отметка, поставленная позже периода, иначе пропадала бы после
 * перечитки обзора, кнопка возвращалась и копила дубли. Чистые функции.
 */
import type { AiAnalyticsFeedbackRecord } from '../../store/ai-analytics-feedback.store';
import {
    type LeverFeedbackMarks,
    periodLeverFeedbackMarks,
} from './feedback-lever.util';

const DISAGREE_KIND = 'disagree';

/** Обратная связь периода, нужная обзору: несогласия и отметки по советам. */
export interface OverviewFeedbackFacts {
    disagreementsCount: number;
    levers: LeverFeedbackMarks;
}

/** Правая граница выборки: «сейчас», если период уже закончился. */
export function overviewFeedbackUntil(to: Date, now: Date): Date {
    return now.getTime() > to.getTime() ? now : to;
}

/** Несогласия — только за период; отметки по советам — вся выборка. */
export function overviewFeedbackFacts(
    records: readonly AiAnalyticsFeedbackRecord[],
    to: Date,
): OverviewFeedbackFacts {
    return {
        disagreementsCount: records.filter(
            record =>
                record.kind === DISAGREE_KIND &&
                record.createdAt.getTime() <= to.getTime(),
        ).length,
        levers: periodLeverFeedbackMarks(records, to),
    };
}
