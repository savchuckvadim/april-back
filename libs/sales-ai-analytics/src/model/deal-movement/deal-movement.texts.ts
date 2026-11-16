/**
 * Движение сделок: статус и причины словами — для комментария в сделке и
 * сводки руководителю. По-русски, без кодов. Чистые функции.
 */
import type {
    DealMovementFacts,
    DealMovementReason,
    DealMovementStatus,
    DealMovementVerdict,
} from './deal-movement.types';

export const DEAL_MOVEMENT_STATUS_TITLES: Readonly<
    Record<DealMovementStatus, string>
> = {
    moving: 'Движется',
    stuck: 'Застряла',
    rolled_back: 'Откатилась',
    at_risk: 'Под риском',
};

/** Число со словом в нужной форме: 1 день, 3 дня, 12 дней. */
function daysText(days: number): string {
    const mod100 = days % 100;
    const mod10 = days % 10;
    const word =
        mod100 >= 11 && mod100 <= 14
            ? 'дней'
            : mod10 === 1
              ? 'день'
              : mod10 >= 2 && mod10 <= 4
                ? 'дня'
                : 'дней';
    return `${days} ${word}`;
}

/** 'YYYY-MM-DD' → 'ДД.ММ'. */
const shortDate = (date: string): string =>
    `${date.slice(8, 10)}.${date.slice(5, 7)}`;

const REASON_TEXT: Readonly<
    Record<DealMovementReason, (facts: DealMovementFacts) => string>
> = {
    stage_back: () => 'стадия сделки вернулась назад',
    stage_overdue: facts =>
        `в стадии ${daysText(facts.daysInStage)} при обычных ${facts.stageLimitDays}, звонков за последнее время нет`,
    step_overdue: facts =>
        facts.stepDate
            ? `договорились на ${shortDate(facts.stepDate)} — контакта после этого не было`
            : 'договорённость просрочена — контакта после неё не было',
    progress_low_twice: () =>
        'два последних звонка подряд ничего не изменили по сделке',
    agreed_but_still: facts =>
        facts.daysSinceAgreed === null
            ? 'клиент согласился по звонку, а стадия не меняется'
            : `клиент согласился по звонку, а стадия не меняется ${daysText(facts.daysSinceAgreed)}`,
    low_chance_big_sum: () =>
        'крупная сделка на стадии, с которой продажи случаются редко',
    forgotten: () => 'сделка в списке забытых: по ней давно нет работы',
    stage_forward: () => 'стадия сделки продвинулась вперёд',
    progress_ok: () => 'последний звонок продвинул сделку',
    step_done: facts =>
        facts.stepDate
            ? `договорённость на ${shortDate(facts.stepDate)} выполнена`
            : 'договорённость выполнена',
    no_signals: () => 'тревожных признаков нет',
};

/** Причины статуса словами, главная — первой. */
export function dealMovementReasonTexts(
    verdict: Pick<DealMovementVerdict, 'reasons' | 'facts'>,
): string[] {
    return verdict.reasons.map(reason => REASON_TEXT[reason](verdict.facts));
}

/** Одна строка для сводки: «Под риском: договорились на 05.11 — …». */
export function dealMovementLine(
    verdict: Pick<DealMovementVerdict, 'status' | 'reasons' | 'facts'>,
): string {
    return `${DEAL_MOVEMENT_STATUS_TITLES[verdict.status]}: ${dealMovementReasonTexts(verdict).join('; ')}`;
}
