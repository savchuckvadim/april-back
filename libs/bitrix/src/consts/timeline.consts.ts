import { toBatchSafeText } from './batch.consts';

/**
 * РАЗМЕТКА КОММЕНТАРИЯ ТАЙМЛАЙНА CRM (`crm.timeline.comment.add`).
 *
 * ССЫЛКИ В ТАЙМЛАЙНЕ — ТОЛЬКО HTML, НЕ BB-КОД. Правило выведено из двух
 * рабочих контуров, а не из документации (она про разметку молчит):
 *  - легаси-хук (Laravel, `BitrixTimeLineService`) писал
 *    `<a href="…" target="_blank">Название</a>` — ссылки кликабельны;
 *  - конструктор (`SupplyReportBitrixService`) пишет то же самое — и там
 *    тоже всё рендерится.
 * BB-вариант `[URL=…]…[/URL]` в таймлайне карточки доезжает СЫРЫМ текстом,
 * поэтому в комментарии таймлайна его быть не должно. BB-код остаётся
 * верным для ДРУГИХ проводов — `im.notify` (push/чат) и DESCRIPTION задачи
 * с `DESCRIPTION_IN_BBCODE: 'Y'`; их эти функции не касаются.
 *
 * ПЕРЕНОСЫ И ЭКРАНИРОВАНИЕ — НА ГРАНИЦЕ ТРАНСПОРТА. Форматтеры собирают
 * текст с обычными `\n` (так его читают и тесты), а {@link toTimelineComment}
 * один раз готовит готовую строку к отправке batch-командой
 * ({@link toBatchSafeText}: `%`, `+`, `&`, `#` и переносы). Экранировать
 * по кускам нельзя — второй проход удвоил бы `%`.
 */

/** Ссылка на карточку CRM: `https://<домен>/crm/<раздел>/details/<id>/`. */
export const crmCardUrl = (
    domain: string,
    section: string,
    id: number | string,
): string => `https://${domain}/crm/${section}/details/${id}/`;

/**
 * Текст, приехавший ИЗВНЕ (название компании, имя контакта, комментарий
 * менеджера), внутри HTML-комментария.
 *
 * Угловые скобки вырезаются: пользовательский `<` ломает разбор разметки, и
 * дальше в карточку уезжает каша вместо записи. Прочие символы (`&`, кавычки)
 * оставляем как есть — легаси писал их сырыми, и таймлайн их показывает; а
 * html-сущности в нём наоборот отображались бы буквально (`&amp;`).
 */
export const timelineText = (text: string): string =>
    String(text ?? '').replace(/[<>]/g, '');

/** `<b>…</b>` — жирная строка комментария. */
export const timelineBold = (text: string): string =>
    `<b>${timelineText(text)}</b>`;

/**
 * Кликабельная ссылка комментария. `url` собирается кодом (домен + id),
 * поэтому санируется только подпись; кавычки в url не пропускаем, чтобы
 * атрибут нельзя было закрыть.
 */
export const timelineLink = (url: string, text: string): string =>
    `<a href="${String(url).replace(/["<>\s]/g, '')}" target="_blank">${timelineText(text)}</a>`;

/** `Подпись: <ссылка>` — единый вид строки-ссылки во всех комментариях. */
export const timelineLinkLine = (
    label: string,
    url: string,
    text: string,
): string => `${timelineText(label)}: ${timelineLink(url, text)}`;

/**
 * Строки комментария → значение поля `COMMENT` batch-команды.
 *
 * Пустые строки отбрасываются (блок без данных не должен оставлять дырку),
 * склейка — обычным `\n`, и только потом единственное экранирование под
 * batch-провод.
 */
export const toTimelineComment = (lines: readonly string[]): string =>
    toBatchSafeText(lines.filter(line => line && line.trim()).join('\n'));

/**
 * Сборка комментария для ПРЯМОГО вызова `crm.timeline.comment.add`.
 *
 * Экранирование {@link toBatchSafeText} существует потому, что batch склеивает
 * значения в строку запроса и Битрикс разбирает её как URL. При прямом вызове
 * склейки нет, и декодировать `%0A` / `%2B` / `%23` некому — они остаются в
 * тексте комментария буквально. Так и случилось 16.09.2026: в карточку уехало
 * «Телефоны: %2B79102880648» и «Лид %23124063».
 *
 * Правило: идёт через `buffer.queue` / batch — {@link toTimelineComment};
 * идёт через `api.call` — этот.
 */
export const toTimelineCommentDirect = (lines: readonly string[]): string =>
    lines.filter(line => line && line.trim()).join('\n');
