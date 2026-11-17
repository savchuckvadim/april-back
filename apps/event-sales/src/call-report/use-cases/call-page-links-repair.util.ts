/**
 * ПОЧИНКА ССЫЛОК НА СТРАНИЦУ РАЗБОРА — чистые правила (разовая работа).
 *
 * С выкладки страницы разбора 16.11.2026 до исправления адреса 17.11.2026
 * ссылки в ленте Битрикс24 писались на сайт, которого нет
 * (kpi-sales.april-app.ru). Код ссылки верный: та же страница открывается на
 * действующем сайте «Отчёта», поэтому в комментарии меняется только адрес
 * сайта. Решение владельца 17.11.2026: переписать, медленно, чтобы не
 * нагружать порталы.
 *
 * Когда все порталы пройдены (отметка «готово» в Redis), шаг ничего не
 * делает; после 01.12.2026 этот файл, use-case и хранилище можно удалить.
 * Без DI, Bitrix и `new Date()`.
 */
import { BitrixEntityType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';

/** Адрес сайта, на который ошибочно вели ссылки. */
export const DEAD_CALL_PAGE_SITE = 'https://kpi-sales.april-app.ru';

/** Путь страницы разбора на сайте: `<сайт>/call/<код>`. */
const CALL_PAGE_PATH = '/call/';

/**
 * Когда создавались разборы со ссылкой на мёртвый адрес, с запасом по краям:
 * выкладка страницы разбора шла 16.11.2026 после 15:18 UTC, исправление
 * адреса доехало 17.11.2026 около 08:15 UTC.
 */
export const CALL_PAGE_LINKS_REPAIR_WINDOW = {
    from: new Date('2026-11-16T15:00:00.000Z'),
    to: new Date('2026-11-17T09:00:00.000Z'),
} as const;

/** Сколько разборов портала проверяется за один проход (проход — раз в час). */
export const CALL_PAGE_LINKS_REPAIR_QUOTA = 40;

/** После скольких неудачных проходов разбор пропускается с предупреждением. */
export const CALL_PAGE_LINKS_REPAIR_MAX_ATTEMPTS = 3;

/** Сколько свежих комментариев ленты просматривается (одна страница Битрикса). */
export const CALL_PAGE_LINKS_COMMENTS_PAGE = 50;

/**
 * Текст комментария с исправленным адресом сайта; ссылок на мёртвый адрес
 * нет — null (комментарий не трогаем).
 * @param site действующий сайт «Отчёта» без «/» на конце
 */
export function rewriteCallPageLinks(
    comment: string,
    site: string,
): string | null {
    const dead = `${DEAD_CALL_PAGE_SITE}${CALL_PAGE_PATH}`;
    if (!comment.includes(dead)) return null;
    return comment.split(dead).join(`${site}${CALL_PAGE_PATH}`);
}

/** Запись разбора в объёме починки. */
export interface LinksRepairRecordView {
    id: string;
    entity_type: string;
    entity_id: number;
    report_item_id: string;
    createdAt: Date;
}

/** Лента, в которую разбор писал ссылку. */
export interface CallPageLinkTarget {
    /** Тип сущности для методов комментариев ленты: deal, lead, DYNAMIC_<id>. */
    entityType: string;
    entityId: number;
}

const positiveInt = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Ленты, куда разбор писал ссылку: сделка или лид звонка (дубль разбора) и
 * карточка разбора в смарте (отдельная запись со ссылкой).
 * @param smartEntityTypeId тип смарта «AI-анализ звонков»; не установлен — null
 */
export function callPageLinkTargets(
    record: Pick<
        LinksRepairRecordView,
        'entity_type' | 'entity_id' | 'report_item_id'
    >,
    smartEntityTypeId: number | null,
): CallPageLinkTarget[] {
    const targets: CallPageLinkTarget[] = [];
    const entityId = positiveInt(record.entity_id);
    const isDealOrLead =
        record.entity_type === String(BitrixEntityType.DEAL) ||
        record.entity_type === String(BitrixEntityType.LEAD);
    if (isDealOrLead && entityId !== null) {
        targets.push({ entityType: record.entity_type, entityId });
    }
    const itemId = positiveInt(record.report_item_id);
    if (smartEntityTypeId !== null && itemId !== null) {
        targets.push({
            entityType: `DYNAMIC_${smartEntityTypeId}`,
            entityId: itemId,
        });
    }
    return targets;
}

/** Разборы окна, которые ещё не проверены, — старые первыми. */
export function pendingLinkRepairs<T extends LinksRepairRecordView>(
    records: readonly T[],
    seen: ReadonlySet<string>,
): T[] {
    return records
        .filter(record => !seen.has(record.id))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Итог прохода починки по порталу. */
export interface CallPageLinksRepairResult {
    domain: string;
    /** Разборов проверено за проход. */
    checked: number;
    /** Комментариев с исправленным адресом. */
    rewritten: number;
    /** Разборов пропущено после нескольких неудачных проходов. */
    gaveUp: number;
    /** Портал пройден целиком именно этим проходом. */
    finished: boolean;
}

/** Строка итога по порталу для Telegram; пусто — сообщать нечего. */
export function linksRepairSummaryLine(
    result: CallPageLinksRepairResult,
): string {
    const parts: string[] = [];
    if (result.rewritten) {
        parts.push(
            `исправлено ссылок на страницу разбора в ленте — ${result.rewritten}`,
        );
    }
    if (result.gaveUp) {
        parts.push(
            `не удалось проверить ссылки у ${result.gaveUp} разборов — смотреть руками`,
        );
    }
    if (result.finished) {
        parts.push('старые ссылки на страницу разбора проверены все');
    }
    return parts.length ? `${result.domain}: ${parts.join(', ')}` : '';
}
