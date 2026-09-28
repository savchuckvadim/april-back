/**
 * Общие кирпичи буллетов шаблонного резюме: обрезка текста по словам и
 * сборка буллета из факта пакета. Нужны и группам шаблона
 * (`brief-template.groups.ts`), и правилам действий (`brief-actions.ts`).
 *
 * Чистые функции: без DI, времени и случайности.
 */
import {
    AI_BRIEF_LIMITS,
    type AiBriefBullet,
    type AiBriefFact,
} from '../contracts/ai-brief.contract';

/** Обрезка текста до лимита слов (без «…» — фраза факта самодостаточна). */
export function limitWords(text: string, maxWords: number): string {
    const words = text.trim().split(/\s+/);

    return words.length <= maxWords
        ? text.trim()
        : words.slice(0, maxWords).join(' ');
}

/** Факт → буллет с общими полями (адресат, ссылка, изменение). */
export function bulletOf(
    fact: AiBriefFact,
    group: AiBriefBullet['group'],
    text: string,
    delta?: number | null,
): AiBriefBullet {
    return {
        text: limitWords(text, AI_BRIEF_LIMITS.bulletWords),
        group,
        factRefs: [fact.code],
        ...(fact.managerId === undefined ? {} : { managerId: fact.managerId }),
        ...(fact.callType === undefined ? {} : { callType: fact.callType }),
        ...(fact.link === undefined ? {} : { link: fact.link }),
        ...(typeof delta === 'number' ? { delta } : {}),
    };
}
