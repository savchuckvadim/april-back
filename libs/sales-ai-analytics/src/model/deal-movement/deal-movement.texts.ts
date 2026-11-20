/**
 * Движение сделок: статус и причины словами — для записи в сделке, сводки
 * руководителю и снимка. По-русски, без кодов. Подписи статусов — только из
 * `DEAL_MOVEMENT_STATUS_LABELS` (portal-lib): сменить подпись = одна правка
 * там (решение владельца 20.11.2026). Чистые функции.
 */
import { DEAL_MOVEMENT_STATUS_LABELS } from '@lib/portal-lib/store/app-settings';
import type {
    DealMovementFacts,
    DealMovementReason,
    DealMovementRecentWork,
    DealMovementStatus,
    DealMovementVerdict,
} from './deal-movement.types';

/** Подпись статуса для людей; проверка: подпись есть у каждого кода. */
export const DEAL_MOVEMENT_STATUS_TITLES: Readonly<
    Record<DealMovementStatus, string>
> = DEAL_MOVEMENT_STATUS_LABELS;

/** Форма слова по числу: 1 день, 3 дня, 12 дней. */
function plural(count: number, one: string, few: string, many: string): string {
    const mod100 = count % 100;
    const mod10 = count % 10;
    if (mod100 >= 11 && mod100 <= 14) return many;
    if (mod10 === 1) return one;
    return mod10 >= 2 && mod10 <= 4 ? few : many;
}

/** Число со словом в нужной форме: 1 день, 3 дня, 12 дней. */
export function dealMovementDaysText(days: number): string {
    return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

/** Предложный падеж: «при 21 дне», «при 34 днях». */
const daysPrepositional = (days: number): string =>
    `${days} ${days % 10 === 1 && days % 100 !== 11 ? 'дне' : 'днях'}`;

/** 'YYYY-MM-DD' → 'ДД.ММ'. */
export const dealMovementShortDate = (date: string): string =>
    `${date.slice(8, 10)}.${date.slice(5, 7)}`;

/**
 * С каким сроком сравнивали (решение владельца 20.11.2026): «при обычных
 * 34 днях для этой стадии» — по истории портала, «при пороге 21 день» —
 * общая настройка.
 */
export const dealMovementLimitText = (
    facts: Pick<DealMovementFacts, 'stageLimitDays' | 'stageLimitSource'>,
): string =>
    facts.stageLimitSource === 'history'
        ? `при обычных ${daysPrepositional(facts.stageLimitDays)} для этой стадии`
        : `при пороге ${dealMovementDaysText(facts.stageLimitDays)}`;

/** «13.11», «13.11 и 16.11», «10.11, 13.11 и 16.11». */
function datesText(days: readonly string[]): string {
    const dates = days.map(dealMovementShortDate);
    return dates.length <= 1
        ? (dates[0] ?? '')
        : `${dates.slice(0, -1).join(', ')} и ${dates.at(-1)}`;
}

/** Больше стольких дат — числом и последней датой. */
const DATES_SHOWN = 3;

/** Слова события: одно, список дат и счёт «5 звонков, последний …». */
interface EventWords {
    readonly single: string;
    readonly list: string;
    readonly one: string;
    readonly few: string;
    readonly many: string;
    readonly last: string;
}

const CALL_WORDS: EventWords = {
    single: 'звонок',
    list: 'звонки',
    one: 'звонок',
    few: 'звонка',
    many: 'звонков',
    last: 'последний',
};
const ACTIVITY_WORDS: EventWords = {
    single: 'дело',
    list: 'дела',
    one: 'дело',
    few: 'дела',
    many: 'дел',
    last: 'последнее',
};
const TASK_WORDS: EventWords = {
    single: 'задача',
    list: 'задачи',
    one: 'задача',
    few: 'задачи',
    many: 'задач',
    last: 'последняя',
};

/** «звонки 13.11 и 16.11», «5 звонков, последний 16.11». */
function eventsText(days: readonly string[], words: EventWords): string {
    if (days.length > DATES_SHOWN) {
        const count = days.length;
        return `${count} ${plural(count, words.one, words.few, words.many)}, ${words.last} ${dealMovementShortDate(days.at(-1) ?? '')}`;
    }
    const word = days.length === 1 ? words.single : words.list;
    return `${word} ${datesText(days)}`;
}

/** Работа за окно словами: «звонки 13.11 и 16.11 (недозвоны), дело 18.11». */
export function dealMovementRecentWorkText(
    work: DealMovementRecentWork,
): string {
    const parts: string[] = [];
    if (work.callDays.length > 0) {
        const missed = work.callsMissed
            ? work.callDays.length === 1
                ? ' (недозвон)'
                : ' (недозвоны)'
            : '';
        parts.push(eventsText(work.callDays, CALL_WORDS) + missed);
    }
    if (work.activityDays.length > 0) {
        parts.push(eventsText(work.activityDays, ACTIVITY_WORDS));
    }
    if (work.taskDays.length > 0) {
        parts.push(eventsText(work.taskDays, TASK_WORDS));
    }
    if (work.stageDays.length > 0) {
        parts.push(`смена стадии ${datesText(work.stageDays)}`);
    }
    if (parts.length === 0 && work.activityOnly !== null) {
        parts.push(
            `активность в сделке ${dealMovementShortDate(work.activityOnly)}`,
        );
    }
    return parts.join(', ');
}

/** «ни звонков, ни дел 40 дней» или «… больше 60 дней» за пределом чтения. */
function idleText(facts: DealMovementFacts): string {
    const exact =
        facts.idleDays !== null && facts.idleDays <= facts.idleLookbackDays;
    return exact
        ? `ни звонков, ни дел ${dealMovementDaysText(facts.idleDays ?? 0)}`
        : `ни звонков, ни дел больше ${dealMovementDaysText(facts.idleLookbackDays)}`;
}

const REASON_TEXT: Readonly<
    Record<DealMovementReason, (facts: DealMovementFacts) => string>
> = {
    stage_back: () => 'стадия сделки вернулась назад',
    no_work: facts =>
        `${idleText(facts)}; в стадии ${dealMovementDaysText(facts.daysInStage)} ${dealMovementLimitText(facts)}`,
    stage_overdue: facts => {
        const stall = `стадия не меняется ${dealMovementDaysText(facts.daysInStage)} ${dealMovementLimitText(facts)}`;
        return facts.recentWork === null
            ? stall
            : `${dealMovementRecentWorkText(facts.recentWork)}, ${stall}`;
    },
    step_overdue: facts =>
        facts.stepDate
            ? `договорились на ${dealMovementShortDate(facts.stepDate)} — контакта после этого не было`
            : 'договорённость просрочена — контакта после неё не было',
    progress_low_twice: () =>
        'два последних звонка подряд ничего не изменили по сделке',
    agreed_but_still: facts =>
        facts.daysSinceAgreed === null
            ? 'клиент согласился по звонку, а стадия не меняется'
            : `клиент согласился по звонку, а стадия не меняется ${dealMovementDaysText(facts.daysSinceAgreed)}`,
    low_chance_big_sum: () =>
        'крупная сделка на стадии, с которой продажи случаются редко',
    forgotten: () => 'сделка в списке забытых: по ней давно нет работы',
    stage_forward: () => 'стадия сделки продвинулась вперёд',
    progress_ok: () => 'последний звонок продвинул сделку',
    step_done: facts =>
        facts.stepDate
            ? `договорённость на ${dealMovementShortDate(facts.stepDate)} выполнена`
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
