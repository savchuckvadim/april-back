import {
    timelineLink,
    toSafeHref,
    toTimelineCommentDirect,
} from '@lib/bitrix/consts/timeline.consts';

/**
 * Имя файла договора: «Договор <название>-<номер>-<счётчик>.docx». Пробелы в
 * названии схлопываются: из сборки названия приходили тройные пробелы
 * («Юрист   СТАР»), а с ними и имя файла на Диске.
 */
export const contractFileName = (
    name: string,
    number: string | undefined,
    count: number,
): string => {
    const title = String(name ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    return number
        ? `Договор ${title}-${number}-${count}.docx`
        : `Договор ${title}-${count}.docx`;
};

/**
 * Комментарий таймлайна со ссылкой на договор для прямого вызова
 * `crm.timeline.comment.add`.
 *
 * Ссылка — `DETAIL_URL` файла на Диске, Битрикс отдаёт его с пробелами и
 * кириллицей как есть. Сырой адрес в `href` обрывался на первом пробеле, и
 * ссылка вела на «…/Договоры/Договор» (27.11.2026). Адрес кодируется
 * {@link toSafeHref}, как ссылка на папку поставки.
 */
export const contractTimelineComment = (
    link: string,
    documentName: string,
): string =>
    toTimelineCommentDirect([
        `📝 ${timelineLink(toSafeHref(link), documentName)}`,
    ]);
