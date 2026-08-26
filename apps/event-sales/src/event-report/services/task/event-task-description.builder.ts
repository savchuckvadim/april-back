import { IBXCompany, IBXContact, IBXLead } from '@/modules/bitrix';
import {
    DuplicateEntityType,
    normalizePhone,
} from '@lib/portal-lib/pbx-duplicate';
import { entityCardUrl } from '../../../sales-hooks/duplicate-check/lib/duplicate-timeline.formatter';

/**
 * Каркас и палитра DESCRIPTION задачи обзвона.
 *
 * ⚠️ ЦВЕТА — ПЛЕЙСХОЛДЕР. Оригинал («Сервисный сигнал») живёт задачей на
 * портале владельца, доступа к ней у бэка нет. Здесь собран нейтральный
 * каркас в той же BB-стилистике, что уже используется в репо
 * (`DealWarningsBbcodeFormatterService`): синий заголовок секции, охра для
 * акцента, серый для служебного текста. Как только владелец пришлёт образец
 * (скриншот или исходный BB-текст задачи), правится ТОЛЬКО эта константа —
 * рендер её не дублирует.
 */
export const EVENT_TASK_DESCRIPTION_STYLE = {
    colors: {
        /** Заголовок секции. */
        heading: '#1d74d8',
        /** Акцент внутри секции (имя сущности, группа телефонов). */
        accent: '#d97706',
        /** Служебный текст (подписи типов телефонов). */
        muted: '#6b7280',
    },
    icons: {
        links: '🔗',
        phones: '📞',
        comment: '💬',
    },
    /** Разделитель между секциями. */
    divider: '——————————',
    /** Маркер строки-пункта. */
    bullet: '•',
} as const;

/** Порядок секций — единый для всех задач, менять только здесь. */
export const EVENT_TASK_DESCRIPTION_SECTIONS = [
    'links',
    'phones',
    'comment',
] as const;

export type EventTaskDescriptionSection =
    (typeof EVENT_TASK_DESCRIPTION_SECTIONS)[number];

/**
 * Телефонов с ОДНОЙ сущности в описание уходит не больше этого числа
 * («последние 50 из каждой сущности» — требование владельца, todo2508 §13).
 * Берутся последние: свежие номера в мультиполе Битрикса лежат в конце.
 */
export const TASK_DESCRIPTION_PHONE_LIMIT = 50;

/** Основная (sales_base) сделка клиента — только с РЕАЛЬНЫМ id. */
export interface EventTaskDescriptionDeal {
    id: number;
    title?: string;
}

/** Всё, из чего собирается описание. Чистые данные, без Bitrix-вызовов. */
export interface EventTaskDescriptionSource {
    domain: string;
    company: IBXCompany | null;
    lead: IBXLead | null;
    /** Контакты отчёта/плана; null-элементы игнорируются. */
    contacts: readonly (IBXContact | null | undefined)[];
    baseDeal: EventTaskDescriptionDeal | null;
    /** Комментарий менеджера из отчёта — «о чём договорились». */
    comment: string;
}

/**
 * Русские подписи типов телефона (`VALUE_TYPE` мультиполя Битрикса).
 * Неизвестный код показывается как есть — лучше сырое `WORK2`, чем молчание.
 */
const PHONE_TYPE_LABEL: Record<string, string> = {
    WORK: 'Рабочий',
    MOBILE: 'Мобильный',
    HOME: 'Домашний',
    FAX: 'Факс',
    PAGER: 'Пейджер',
    MAILING: 'Рассылка',
    OTHER: 'Другой',
};

interface PhoneEntry {
    value: string;
    /** Подпись типа; null — тип не пришёл. */
    typeLabel: string | null;
}

interface PhoneGroup {
    title: string;
    phones: PhoneEntry[];
}

/**
 * Значение поля Битрикса в текст. Объекты и прочий мусор дают пустую строку:
 * `String(unknown)` превратил бы их в «[object Object]» прямо в описании.
 */
const textOf = (raw: unknown): string => {
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number') return String(raw);
    return '';
};

/**
 * Значение мультиполя Битрикса приезжает в трёх видах: массив объектов
 * `{VALUE, VALUE_TYPE|TYPE}`, массив строк и голая строка. Разбираем все три
 * — иначе телефоны лида (интерфейс объявляет их `string[]`, а портал шлёт
 * объекты) молча теряются.
 */
const readMultifield = (raw: unknown): PhoneEntry[] => {
    const values = Array.isArray(raw) ? raw : [raw];
    const entries: PhoneEntry[] = [];

    for (const item of values) {
        if (item == null) continue;
        if (typeof item === 'string' || typeof item === 'number') {
            const value = textOf(item);
            if (value) entries.push({ value, typeLabel: null });
            continue;
        }
        if (typeof item !== 'object') continue;

        const record = item as Record<string, unknown>;
        const value = textOf(record.VALUE);
        if (!value) continue;
        const rawType = textOf(record.VALUE_TYPE) || textOf(record.TYPE);
        entries.push({
            value,
            typeLabel: rawType
                ? (PHONE_TYPE_LABEL[rawType.toUpperCase()] ?? rawType)
                : null,
        });
    }

    return entries;
};

/**
 * Ключ дедупликации номера: последние 10 цифр (`normalizePhone` из
 * pbx-duplicate — тот же ключ, которым портал ищет дубли). Короткий номер
 * (внутренний, 4-6 цифр) до ключа не дотягивает — схлопываем по цифрам.
 */
const phoneKey = (value: string): string =>
    normalizePhone(value) ?? (value.replace(/\D/g, '') || value);

/** Имя контакта одной строкой; пусто — контакт без имени. */
const contactName = (contact: IBXContact): string =>
    [contact.LAST_NAME, contact.NAME, contact.SECOND_NAME]
        .map(part => (part ?? '').trim())
        .filter(Boolean)
        .join(' ');

const numericId = (raw: unknown): number => {
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : 0;
};

const bb = {
    bold: (text: string): string => `[B]${text}[/B]`,
    color: (color: string, text: string): string =>
        `[color=${color}]${text}[/color]`,
    url: (href: string, text: string): string => `[URL=${href}]${text}[/URL]`,
};

const heading = (icon: string, text: string): string =>
    bb.bold(
        bb.color(
            EVENT_TASK_DESCRIPTION_STYLE.colors.heading,
            `${icon} ${text}`,
        ),
    );

/**
 * DESCRIPTION задачи обзвона в BB-коде Битрикса.
 *
 * Формат (`DESCRIPTION_IN_BBCODE: 'Y'`, поддерживаются `[B] [I] [URL=] [color=]`
 * — см. ответ `tasks.task.add`, поле `descriptionInBbcode`):
 *
 *   [B][color=#1d74d8]🔗 Карточки клиента[/color][/B]
 *   • [URL=https://portal/crm/company/details/12/]Компания: ООО «Ромашка»[/URL]
 *   • [URL=https://portal/crm/deal/details/34/]Сделка: Продажа СПС[/URL]
 *   • [URL=https://portal/crm/contact/details/56/]Контакт: Иванов Иван[/URL]
 *   ——————————
 *   [B][color=#1d74d8]📞 Телефоны[/color][/B]
 *   [B][color=#d97706]Компания: ООО «Ромашка»[/color][/B]
 *   • +7 900 000-00-00 [color=#6b7280](Рабочий)[/color]
 *
 * Правила:
 *  - блок без данных НЕ рендерится (пустых заголовков не бывает);
 *  - телефоны схлопываются по всем сущностям сразу: один номер — одна строка,
 *    у первой сущности, где он встретился (компания → лид → контакты);
 *  - с каждой сущности берётся не больше
 *    {@link TASK_DESCRIPTION_PHONE_LIMIT} последних номеров.
 *
 * Возвращает текст с ОБЫЧНЫМИ `\n`: batch-экранирование (`%0A`, `%26`) —
 * забота вызывающего (`toBatchSafeText`), иначе тест на формат читался бы
 * как набор процентов.
 */
export const buildEventTaskDescription = (
    src: EventTaskDescriptionSource,
): string => {
    // Секции рендерятся в порядке EVENT_TASK_DESCRIPTION_SECTIONS: порядок
    // блоков — часть стиля и правится там же, где палитра.
    const renderers: Record<EventTaskDescriptionSection, () => string> = {
        links: () => buildLinkBlock(src),
        phones: () => buildPhoneBlock(src),
        comment: () => buildCommentBlock(src),
    };

    const blocks = EVENT_TASK_DESCRIPTION_SECTIONS.map(section =>
        renderers[section](),
    ).filter(Boolean);

    return blocks.join(`\n${EVENT_TASK_DESCRIPTION_STYLE.divider}\n`);
};

/** Комментарий менеджера по прошлому событию; '' — комментария не было. */
const buildCommentBlock = (src: EventTaskDescriptionSource): string => {
    const comment = src.comment?.trim() ?? '';
    if (!comment) return '';
    return [
        heading(
            EVENT_TASK_DESCRIPTION_STYLE.icons.comment,
            'Комментарий по прошлому событию',
        ),
        comment,
    ].join('\n');
};

/** Секция ссылок; '' — ни одной карточки не набралось. */
const buildLinkBlock = (src: EventTaskDescriptionSource): string => {
    const links = buildLinkLines(src);
    if (!links.length) return '';
    return [
        heading(EVENT_TASK_DESCRIPTION_STYLE.icons.links, 'Карточки клиента'),
        ...links,
    ].join('\n');
};

/** Ссылки на карточки: компания → основная сделка → контакты → лид. */
const buildLinkLines = (src: EventTaskDescriptionSource): string[] => {
    const { bullet } = EVENT_TASK_DESCRIPTION_STYLE;
    const lines: string[] = [];
    const push = (
        type: DuplicateEntityType,
        id: number,
        label: string,
        title: string,
    ): void => {
        if (!id) return;
        const text = title.trim() ? `${label}: ${title.trim()}` : label;
        lines.push(
            `${bullet} ${bb.url(entityCardUrl(src.domain, type, id), text)}`,
        );
    };

    const companyId = numericId(src.company?.ID);
    push(
        DuplicateEntityType.COMPANY,
        companyId,
        'Компания',
        src.company?.TITLE ?? '',
    );

    push(
        DuplicateEntityType.DEAL,
        numericId(src.baseDeal?.id),
        'Основная сделка',
        src.baseDeal?.title ?? '',
    );

    for (const contact of dedupeContacts(src.contacts)) {
        push(
            DuplicateEntityType.CONTACT,
            numericId(contact.ID),
            'Контакт',
            contactName(contact),
        );
    }

    push(
        DuplicateEntityType.LEAD,
        numericId(src.lead?.ID),
        'Заявка',
        String(src.lead?.TITLE ?? ''),
    );

    return lines;
};

/** Секция телефонов; '' — телефонов нет ни у одной сущности. */
const buildPhoneBlock = (src: EventTaskDescriptionSource): string => {
    const seen = new Set<string>();
    const groups: PhoneGroup[] = [];

    const addGroup = (title: string, raw: unknown): void => {
        const entries = readMultifield(raw).slice(
            -TASK_DESCRIPTION_PHONE_LIMIT,
        );
        const phones: PhoneEntry[] = [];
        for (const entry of entries) {
            const key = phoneKey(entry.value);
            if (seen.has(key)) continue;
            seen.add(key);
            phones.push(entry);
        }
        if (phones.length) groups.push({ title, phones });
    };

    if (src.company) {
        addGroup(
            `Компания${src.company.TITLE ? `: ${src.company.TITLE}` : ''}`,
            (src.company as Record<string, unknown>).PHONE,
        );
    }
    if (src.lead) {
        addGroup(
            `Заявка${src.lead.TITLE ? `: ${String(src.lead.TITLE)}` : ''}`,
            (src.lead as unknown as Record<string, unknown>).PHONE,
        );
    }
    for (const contact of dedupeContacts(src.contacts)) {
        const name = contactName(contact);
        addGroup(`Контакт${name ? `: ${name}` : ''}`, contact.PHONE);
    }

    if (!groups.length) return '';

    const { bullet, colors, icons } = EVENT_TASK_DESCRIPTION_STYLE;
    const lines: string[] = [heading(icons.phones, 'Телефоны')];
    for (const group of groups) {
        lines.push(bb.bold(bb.color(colors.accent, group.title)));
        for (const phone of group.phones) {
            const suffix = phone.typeLabel
                ? ` ${bb.color(colors.muted, `(${phone.typeLabel})`)}`
                : '';
            lines.push(`${bullet} ${phone.value}${suffix}`);
        }
    }
    return lines.join('\n');
};

/** Контакты отчёта и плана часто один и тот же человек — схлопываем по ID. */
const dedupeContacts = (
    contacts: readonly (IBXContact | null | undefined)[],
): IBXContact[] => {
    const seen = new Set<number>();
    const result: IBXContact[] = [];
    for (const contact of contacts) {
        if (!contact) continue;
        const id = numericId(contact.ID);
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        result.push(contact);
    }
    return result;
};
