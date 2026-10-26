/** Подпись сообщения без текста: файл, стикер, голосовое. */
export const SUPPORT_EMPTY_MESSAGE_TEXT = 'вложение без текста';

/**
 * Текст сообщения Битрикса → обычный текст: упоминания и ссылки
 * превращаются в подписи, прочие BB-теги убираются, пробелы схлопываются.
 */
export function toSupportPlainText(raw: string | null | undefined): string {
    const text = String(raw ?? '')
        .replace(/\[USER=\d+[^\]]*\]([\s\S]*?)\[\/USER\]/gi, '$1')
        .replace(/\[URL=[^\]]*\]([\s\S]*?)\[\/URL\]/gi, '$1')
        .replace(/\[\/?[A-Z]+(?:=[^\]]*)?\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    return text || SUPPORT_EMPTY_MESSAGE_TEXT;
}
