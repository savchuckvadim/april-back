/**
 * Нарезка сводки на сообщения Telegram. Лимит считается по тексту ПОСЛЕ
 * экранирования Markdown v1 (`toTelegramMarkdownText` — его же применяет
 * `TelegramService.sendMessage`): каждый `_ * [ \`` превращается в два
 * знака, и сообщение у самой границы иначе обрезалось бы на середине.
 * Режем по порталам, большой портал — по строкам; строка длиннее лимита
 * обрезается. Чистые функции.
 */
import { toTelegramMarkdownText } from '@lib/telegram';

/**
 * Предел одной части, знаков после экранирования: у Telegram 4096, сервис
 * режет на 4000 и дописывает свой префикс «NEST {приложение}: ».
 */
export const CALL_REVIEWS_DIGEST_PART_LIMIT = 3800;

/** Подпись к заголовку второй и следующих частей. */
const CONTINUED = ' (продолжение)';

/** Длина текста в сообщении Telegram (после экранирования). */
const telegramLength = (text: string): number =>
    toTelegramMarkdownText(text).length;

/** Строка, укороченная до предела после экранирования (с «…»). */
function clip(text: string, limit: number): string {
    if (telegramLength(text) <= limit) return text;
    let end = Math.min(text.length, limit);
    while (end > 0 && telegramLength(`${text.slice(0, end)}…`) > limit) {
        end -= 1;
    }
    return `${text.slice(0, end)}…`;
}

/**
 * Заголовок + блоки (каждый — строки одного портала) → части сообщения.
 * Блоки разделены пустой строкой; блок, который не влезает целиком даже в
 * новую часть, идёт по строкам.
 */
export function packDigestParts(
    header: string,
    blocks: readonly (readonly string[])[],
    limit: number = CALL_REVIEWS_DIGEST_PART_LIMIT,
): string[] {
    const fits = (text: string): boolean => telegramLength(text) <= limit;
    const continued = `${header}${CONTINUED}`;
    const parts: string[] = [];
    let current = clip(header, limit);
    const append = (piece: string, separator: string): void => {
        const next = `${current}${separator}${piece}`;
        if (fits(next)) {
            current = next;
            return;
        }
        parts.push(current);
        const room = limit - telegramLength(continued) - 2;
        current = `${continued}\n\n${clip(piece, room)}`;
    };
    for (const lines of blocks) {
        const block = lines.join('\n');
        if (fits(`${continued}\n\n${block}`)) {
            append(block, '\n\n');
            continue;
        }
        lines.forEach((line, index) =>
            append(line, index === 0 ? '\n\n' : '\n'),
        );
    }
    parts.push(current);
    return parts;
}
