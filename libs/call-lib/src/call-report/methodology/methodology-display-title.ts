import {
    POLYANSKY_METHODOLOGY,
    POLYANSKY_METHODOLOGY_CODE,
} from './polyansky.methodology';

/**
 * Имя методики для людей (решение владельца 18.11.2026): «Методика
 * Полянского», а не «Полянский». Только показ — `title` методики, строки
 * `ai_methodologies` и тексты задания модели («ПРОВЕРКА ПО МЕТОДИКЕ «…»»,
 * «ЯКОРЯ ШКАЛЫ ПО МЕТОДИКЕ «…»») не меняются: смена промпта начинает новую
 * серию оценок. Сохранённые записи не переписываются. Чистые функции.
 */

/** Из чего строится имя: код методики (в старой записи может не быть) и её название. */
export interface MethodologyNameSource {
    code: string | null;
    title: string;
}

/** Имя встроенной методики Полянского для людей. */
export const POLYANSKY_DISPLAY_TITLE = 'Методика Полянского';

/** Название уже начинается со слова «методика» (регистр не важен). */
const STARTS_WITH_METHODOLOGY_WORD = /^методика(?![\p{L}\p{N}])/iu;

/** Буква или цифра — продолжение слова, а не новая часть названия. */
const WORD_CONTINUES = /^[\p{L}\p{N}]/u;

/**
 * Хвост названия после «Полянский» — у строк таблицы с кодом встроенной
 * («Полянский (gsr)» → « (gsr)»); название начинается иначе — null.
 */
function polyanskyTailOf(title: string): string | null {
    const base = POLYANSKY_METHODOLOGY.title;
    if (!title.startsWith(base)) return null;
    const tail = title.slice(base.length);
    return WORD_CONTINUES.test(tail) ? null : tail;
}

/**
 * Имя методики для людей:
 * - код встроенной Полянского → «Методика Полянского» (хвост названия
 *   строки таблицы сохраняется: «Методика Полянского (gsr)»);
 * - название уже начинается со слова «методика» → как есть, с заглавной;
 * - иначе → «Методика «название»».
 */
export function methodologyDisplayTitle({
    code,
    title,
}: MethodologyNameSource): string {
    const name = title.trim();
    if (code === POLYANSKY_METHODOLOGY_CODE) {
        const tail = polyanskyTailOf(name);
        if (tail !== null) return `${POLYANSKY_DISPLAY_TITLE}${tail}`;
    }
    if (STARTS_WITH_METHODOLOGY_WORD.test(name)) {
        return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    }
    return `Методика «${name}»`;
}
