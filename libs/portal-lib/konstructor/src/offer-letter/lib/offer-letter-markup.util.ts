/**
 * Разметка текста письма КП.
 *
 * Теги знает рендер PDF-КП (`apps/konstructor/src/offer-pdf/templates/shared/rich-text.ts`)
 * и легаси-рендер Word. `<color>` — акцентный цвет (жирным), `<red>` — красный
 * (жирным), `<bold>` — жирный текст цветом письма. Переводы строк — `\n`.
 * Список здесь и в рендере PDF держится вручную: тест админки сверяет их.
 */
export const OFFER_LETTER_MARKUP_TAGS = ['color', 'bold', 'red'] as const;

export type OfferLetterMarkupTag = (typeof OFFER_LETTER_MARKUP_TAGS)[number];

/** Название письма — varchar(255) */
export const OFFER_LETTER_NAME_MAX_LENGTH = 255;

/** Как у текста письма в запросе PDF-КП (`OfferPdfLetterDto.text`) */
export const OFFER_LETTER_TEXT_MAX_LENGTH = 5000;

/** Всё, что выглядит как тег: `<b>`, `</Bold>`, `<br/>` */
const TAG_LIKE = /<\/?[A-Za-z][A-Za-z0-9]*\s*\/?>/g;
/** Ровно то, что понимают рендеры */
const SUPPORTED_TAG = new RegExp(
    `^<(/?)(${OFFER_LETTER_MARKUP_TAGS.join('|')})>$`,
);

const supportedTagsLabel = (): string =>
    OFFER_LETTER_MARKUP_TAGS.map(tag => `<${tag}>`).join(', ');

/**
 * Проверка разметки: только поддерживаемые теги, у каждого открывающего есть
 * закрывающий, пересечений нет. Вложенность допустима: рендер PDF её
 * понимает. Возвращает текст ошибки или null, если разметка в порядке.
 */
export const findOfferLetterMarkupError = (text: string): string | null => {
    const open: OfferLetterMarkupTag[] = [];
    for (const [token] of text.matchAll(TAG_LIKE)) {
        const match = SUPPORTED_TAG.exec(token);
        if (!match) {
            return `Тег ${token} не поддерживается. Доступны: ${supportedTagsLabel()}.`;
        }
        const tag = match[2] as OfferLetterMarkupTag;
        if (!match[1]) {
            open.push(tag);
            continue;
        }
        const last = open.pop();
        if (last === undefined) {
            return `Лишний закрывающий тег </${tag}>: перед ним нет <${tag}>.`;
        }
        if (last !== tag) {
            return `Тег </${tag}> закрыт раньше, чем <${last}>: теги не должны пересекаться.`;
        }
    }
    const unclosed = open.pop();
    return unclosed ? `Не закрыт тег <${unclosed}>.` : null;
};
