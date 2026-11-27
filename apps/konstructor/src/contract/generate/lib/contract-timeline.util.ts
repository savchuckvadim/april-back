import {
    timelineLink,
    toSafeHref,
    toTimelineCommentDirect,
} from '@lib/bitrix/consts/timeline.consts';

/** Расширение файла договора */
const DOCX = /\.docx$/i;

/**
 * Имя файла договора на сервере и на Диске:
 * «Договор_<название>-<номер>-<счётчик>.docx». Имя техническое, без пробелов:
 * оно попадает в адрес ссылки, а читаемый текст ссылки собирает
 * {@link contractLinkText}. Пробелы в названии (из сборки приходили и
 * тройные: «Юрист   СТАР») заменяются одним подчёркиванием.
 */
export const contractFileName = (
    name: string,
    number: string | undefined,
    count: number,
): string => {
    const title = String(name ?? '')
        .trim()
        .replace(/\s+/g, '_');
    return number
        ? `Договор_${title}-${number}-${count}.docx`
        : `Договор_${title}-${count}.docx`;
};

/** Читаемый текст ссылки по имени файла: «Договор Юрист СТАР-11-2» */
export const contractLinkText = (fileName: string): string =>
    fileName.replace(DOCX, '').replace(/_+/g, ' ').trim();

/**
 * Комментарий таймлайна со ссылкой на договор для прямого вызова
 * `crm.timeline.comment.add`.
 *
 * Адрес ссылки — `DETAIL_URL` файла на Диске. Имя файла без пробелов, а
 * кириллицу кодирует {@link toSafeHref}, как ссылку на папку поставки:
 * адрес с пробелами («…/Договоры/Договор Юрист   СТАР-11.docx») вёл не на
 * файл (27.11.2026). Читаемое название — только текст ссылки.
 */
export const contractTimelineComment = (
    link: string,
    documentName: string,
): string =>
    toTimelineCommentDirect([
        `📝 ${timelineLink(toSafeHref(link), contractLinkText(documentName))}`,
    ]);
