import { toSafeHref } from '@lib/bitrix/consts/timeline.consts';

export enum RpaIconEnum {
    ARM = 'arm',
    PROVIDER = 'provider',
    CLIENT = 'client',
    CONSULTING = 'consulting',
    COMPLECT = 'complect',
    INFOBLOCK = 'infoblock',
    CONTRACT = 'contract',
    TOTAL_SUM = 'total_sum',
}

/** Цвет заголовков разделов в записи таймлайна заявки. */
export const RPA_HEADER_COLOR = '#005fa8';

/** Маркер пункта и вложенного пункта: отступ — неразрывными пробелами, обычные карточка съедает. */
export const RPA_BULLET = '• ';
export const RPA_NESTED_BULLET = '    ◦ ';

const HEADER_PREFIX = `[b][color=${RPA_HEADER_COLOR}]`;

/** Кодирование адреса Диска для ссылки — общее для всех комментариев таймлайна. */
export { toSafeHref };

/** Текст внутри BB-разметки: квадратные скобки из данных не должны стать тегом. */
export const toBbText = (text: string): string =>
    String(text ?? '')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');

/** Пункт — одной строкой: «Гарант-Профессионал\n, Интернет 1 ОД» → «…, Интернет 1 ОД». */
const toLineText = (text: string): string =>
    String(text ?? '')
        .replace(/\s*\n\s*/g, ' ')
        .replace(/\s+,/g, ',')
        .trim();

/** Обрезка отступов шаблонных строк; неразрывные пробелы отступа пункта остаются. */
const trimSpaces = (line: string): string =>
    line.replace(/^[ \t\r]+|[ \t\r]+$/g, '');

/**
 * Разметка записей таймлайна RPA — BB-код в комментарии.
 *
 * С 26.11.2026 на gsr описание записи `rpa.timeline.add` показывается простым
 * текстом (ни HTML, ни BB), поэтому записи идут комментарием
 * (`rpa.comment.add`, см. `addRpaComment`). Карточка разбирает BB сама и
 * `[list]` не закрывает — следующий раздел уезжает внутрь списка, поэтому
 * пункты пишутся строками «• …» и «◦ …». Формат проверен на gsr в заявке 2063.
 */
export class RpaCommentHelper {
    public static getBoldString(text: string): string {
        return `[b]${text}[/b]`;
    }

    /** Пункты «• …», по одному на строку; пустые пропускаются. */
    public static getList(list: string[]): string {
        return this.lines(list, RPA_BULLET);
    }

    /** Пункты «• Заголовок: значение» с жирным заголовком. */
    public static getListWithBold(
        list: { head: string; value: string }[],
    ): string {
        return list
            .map(
                item =>
                    `${RPA_BULLET}${this.getBoldString(toLineText(item.head))} ${toLineText(item.value)}`,
            )
            .join('\n');
    }

    /**
     * Группы: «• [b]Пакет[/b]» и под ним состав «◦ …» с отступом. Пустая
     * группа (нет ни названия, ни состава) не даёт пустого пункта.
     */
    public static getGroupedList(
        groups: { head: string; items: string[] }[],
    ): string {
        return groups
            .map(group => {
                const head = toLineText(group.head);
                return [
                    head ? `${RPA_BULLET}${this.getBoldString(head)}` : '',
                    this.lines(group.items, RPA_NESTED_BULLET),
                ]
                    .filter(Boolean)
                    .join('\n');
            })
            .filter(Boolean)
            .join('\n');
    }

    /** Заголовок раздела отдельной строкой; иконок в BB нет, тип оставлен для вызовов. */
    public static getHeaderWithIcon(
        _iconType: RpaIconEnum,
        text: string,
    ): string {
        return `\n${HEADER_PREFIX}${text.trim()}[/color][/b]\n`;
    }

    /** Ссылка. Адрес кодируется: пробел или «]» в нём рвут разметку. */
    public static getLink(url: string, text: string): string {
        return `[url=${toSafeHref(url)}]${toBbText(text)}[/url]`;
    }

    /**
     * Готовый текст записи: отступы шаблонных строк и пустые строки убраны,
     * перед каждым разделом, кроме первого, — одна пустая строка.
     */
    public static toTimelineText(raw: string): string {
        return raw
            .split('\n')
            .map(trimSpaces)
            .filter(line => line)
            .map((line, index) =>
                index > 0 && line.startsWith(HEADER_PREFIX)
                    ? `\n${line}`
                    : line,
            )
            .join('\n');
    }

    /** У комментария нет заголовка — он идёт первой жирной строкой. */
    public static toCommentDescription(title: string, body: string): string {
        return [this.getBoldString(toLineText(title)), body]
            .filter(Boolean)
            .join('\n');
    }

    private static lines(list: string[], bullet: string): string {
        return list
            .map(toLineText)
            .filter(item => item)
            .map(item => `${bullet}${item}`)
            .join('\n');
    }
}
