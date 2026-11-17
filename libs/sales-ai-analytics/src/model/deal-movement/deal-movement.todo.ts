/**
 * «Что сделать» по сделке (решение 17.11.2026): вход модели, разбор ответа
 * и проверка каждой строки. Строка выбрасывается, если в ней больше 25
 * слов, латиница, число не из входа, число словами, стоп-слово или
 * утверждение о причине (хелперы факт-чека AI-резюме); осталось меньше
 * двух строк — блока нет. Чистые функции без DI.
 */
import {
    findAlienNumber,
    findCausal,
    findForbidden,
    findNumberWord,
    wordCount,
} from '../brief-factcheck';
import {
    extractNumbers,
    normalizeBriefText,
    numberKeys,
} from '../brief-numbers';
import {
    DEAL_MOVEMENT_STATUS_TITLES,
    dealMovementDaysText,
} from './deal-movement.texts';
import { DEAL_MOVEMENT_TODO_LIMITS } from './deal-movement.todo.prompt';
import type { DealMovementStatus } from './deal-movement.types';

/** Статусы, для которых просим «что сделать»: у «Движется» блока нет. */
export const DEAL_MOVEMENT_TODO_STATUSES: readonly DealMovementStatus[] = [
    'rolled_back',
    'stuck',
    'at_risk',
];

export const needsDealMovementTodo = (status: DealMovementStatus): boolean =>
    DEAL_MOVEMENT_TODO_STATUSES.includes(status);

/** Почему строка модели не прошла проверку. */
export const DEAL_MOVEMENT_TODO_DROP = {
    empty: 'empty',
    tooLong: 'too-long',
    latin: 'latin',
    numberWord: 'number-word',
    forbidden: 'forbidden-word',
    causal: 'causal',
    alienNumber: 'alien-number',
    duplicate: 'duplicate',
} as const;
export type DealMovementTodoDrop =
    (typeof DEAL_MOVEMENT_TODO_DROP)[keyof typeof DEAL_MOVEMENT_TODO_DROP];

/** Что модель знает о сделке: всё — словами, даты 'ДД.ММ'. */
export interface DealMovementTodoInput {
    status: DealMovementStatus;
    /** Причины статуса словами (`dealMovementReasonTexts`). */
    reasons: readonly string[];
    daysInStage: number;
    /** Последняя договорённость; null — договорённостей в разборах нет. */
    agreement: { date: string | null; text: string | null } | null;
    /** Последний разобранный звонок; null — разобранных звонков нет. */
    lastCall: {
        date: string | null;
        summary: string | null;
        after: string | null;
    } | null;
}

const orDash = (value: string | null): string =>
    value === null || value.trim() === '' ? 'не указано' : value.trim();

/** Вход модели одним текстом — он же источник разрешённых чисел. */
export function buildDealMovementTodoContent(
    input: DealMovementTodoInput,
): string {
    const lines = [
        `Статус сделки: ${DEAL_MOVEMENT_STATUS_TITLES[input.status]}.`,
        `Почему: ${input.reasons.join('; ')}.`,
        `В текущей стадии: ${dealMovementDaysText(input.daysInStage)}.`,
        input.agreement === null
            ? 'Последняя договорённость: нет.'
            : `Последняя договорённость: дата — ${orDash(input.agreement.date)}; ` +
              `о чём — ${orDash(input.agreement.text)}.`,
    ];
    if (input.lastCall === null) {
        lines.push('Последний разобранный звонок: нет.');
    } else {
        lines.push(
            `Последний разобранный звонок: ${orDash(input.lastCall.date)}.`,
            `Резюме звонка: ${orDash(input.lastCall.summary)}`,
            `Что изменилось после звонка: ${orDash(input.lastCall.after)}`,
        );
    }
    return lines.join('\n');
}

/** Ответ модели по схеме → строки; не та форма — null. */
export function parseDealMovementTodo(result: unknown): string[] | null {
    if (typeof result !== 'object' || result === null) return null;
    const actions = (result as Record<string, unknown>).actions;
    if (!Array.isArray(actions)) return null;
    return actions.filter((item): item is string => typeof item === 'string');
}

/** Маркер списка, который модель могла поставить сама: «— », «1. ». */
const LIST_MARKER = /^\s*(?:[-—–•*]|\d{1,2}[.)])\s+/;

const LATIN = /[a-z]/i;

/** Первая причина отказа строке; null — строка проходит. */
function dropReasonOf(
    line: string,
    allowed: ReadonlySet<string>,
): DealMovementTodoDrop | null {
    if (line === '') return DEAL_MOVEMENT_TODO_DROP.empty;
    if (wordCount(line) > DEAL_MOVEMENT_TODO_LIMITS.maxWords) {
        return DEAL_MOVEMENT_TODO_DROP.tooLong;
    }
    if (LATIN.test(line)) return DEAL_MOVEMENT_TODO_DROP.latin;
    if (findNumberWord(line) !== null) {
        return DEAL_MOVEMENT_TODO_DROP.numberWord;
    }
    if (findForbidden(line) !== null) return DEAL_MOVEMENT_TODO_DROP.forbidden;
    if (findCausal(line) !== null) return DEAL_MOVEMENT_TODO_DROP.causal;
    return findAlienNumber(line, allowed) === null
        ? null
        : DEAL_MOVEMENT_TODO_DROP.alienNumber;
}

export interface DealMovementTodoCheck {
    /** Строки для записи; null — меньше двух прошло, блока нет. */
    actions: string[] | null;
    dropped: DealMovementTodoDrop[];
}

/** Проверка строк модели по входу, из которого разрешены числа. */
export function checkDealMovementTodo(
    lines: readonly string[],
    content: string,
): DealMovementTodoCheck {
    const allowed = new Set(extractNumbers(content).flatMap(numberKeys));
    const kept: string[] = [];
    const seen = new Set<string>();
    const dropped: DealMovementTodoDrop[] = [];
    for (const raw of lines) {
        const line = raw.replace(LIST_MARKER, '').trim();
        const key = normalizeBriefText(line);
        const reason = seen.has(key)
            ? DEAL_MOVEMENT_TODO_DROP.duplicate
            : dropReasonOf(line, allowed);
        if (reason !== null) {
            dropped.push(reason);
            continue;
        }
        seen.add(key);
        kept.push(line);
    }
    const actions = kept.slice(0, DEAL_MOVEMENT_TODO_LIMITS.askMax);
    return {
        actions:
            actions.length >= DEAL_MOVEMENT_TODO_LIMITS.keepMin
                ? actions
                : null,
        dropped,
    };
}
