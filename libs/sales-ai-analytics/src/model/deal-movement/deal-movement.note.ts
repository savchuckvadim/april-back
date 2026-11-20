/**
 * Запись движения сделок в ленту сделки (решение 17.11.2026): статус
 * словами, было → стало, причины, дни в стадии, у тревожных статусов —
 * «Что сделать» от модели, в конце — что статус посчитала программа.
 * По-русски, без кодов. Чистые функции.
 */
import {
    DEAL_MOVEMENT_STATUS_TITLES,
    dealMovementDaysText,
    dealMovementReasonTexts,
} from './deal-movement.texts';
import type {
    DealMovementStatus,
    DealMovementVerdict,
} from './deal-movement.types';

/** Заголовок и тело записи (лог-запись журнала берёт их раздельно). */
export interface DealMovementNote {
    title: string;
    text: string;
}

export interface DealMovementNoteInput {
    verdict: Pick<DealMovementVerdict, 'status' | 'reasons' | 'facts'>;
    /** Статус, о котором сделке «сказали» в прошлый раз. */
    from: DealMovementStatus;
    /** Строки «что сделать» после проверки; null или пусто — без блока. */
    actions: readonly string[] | null;
}

export const DEAL_MOVEMENT_NOTE_TEXTS = {
    title: 'Движение сделки',
    closing:
        'Статус посчитала программа по стадиям сделки, звонкам и делам по ней.',
} as const;

const bullets = (lines: readonly string[]): string[] =>
    lines.map(line => `— ${line}`);

export function buildDealMovementNote(
    input: DealMovementNoteInput,
): DealMovementNote {
    const { verdict, from, actions } = input;
    const status = DEAL_MOVEMENT_STATUS_TITLES[verdict.status];
    const lines = [
        `Статус: ${status} (было: ${DEAL_MOVEMENT_STATUS_TITLES[from]}).`,
        'Почему:',
        ...bullets(dealMovementReasonTexts(verdict)),
        `В текущей стадии: ${dealMovementDaysText(verdict.facts.daysInStage)}.`,
    ];
    // У «Движется» блока нет: делать ничего не нужно.
    if (verdict.status !== 'moving' && actions !== null && actions.length > 0) {
        lines.push('', 'Что сделать:', ...bullets(actions));
    }
    lines.push('', DEAL_MOVEMENT_NOTE_TEXTS.closing);
    return {
        title: `${DEAL_MOVEMENT_NOTE_TEXTS.title}: ${status}`,
        text: lines.join('\n'),
    };
}

/**
 * Комментарий ленты одним текстом: заголовок первой строкой жирным —
 * лента понимает BB-код, так оформлены остальные наши записи. У служебной
 * записи журнала заголовок идёт отдельным полем.
 */
export const dealMovementCommentText = (note: DealMovementNote): string =>
    `[b]${note.title}[/b]\n\n${note.text}`;
