/**
 * Повторная заявка присоединена к САМОЙ СВЕЖЕЙ из нескольких открытых
 * сделок клиента (решения владельца 01.10.2026): что известно об этом до
 * записи и по каким элементам пачки оповещать после неё. Чистая логика.
 */
import {
    IRepeatDealInfo,
    IRepeatResolution,
    otherOpenDeals,
} from './repeat-work.resolver';

type BxRow = Record<string, unknown>;

/**
 * Сколько других открытых сделок получают комментарий, а их менеджеры —
 * сообщение. Обычно их одна-три; десятки бывают, когда сигнал общий (домен
 * почты госоргана, телефон приёмной), а каждый комментарий и сообщение —
 * отдельный вызов внутри обработки заявки. Сверх лимита сделки в текстах
 * только посчитаны («и ещё N»); руководители — по-прежнему всех владельцев.
 */
export const MAX_REPEAT_NOTICE_OTHERS = 10;

/** Длинное название (клиента, сделки) в тексте обрезается. */
export const NOTICE_TITLE_LIMIT = 80;

/** Оповещение по одному лиду. */
export interface IRepeatJoinNotice {
    leadId: number;
    /** Как назвать клиента в тексте (см. clientTitleOf). */
    clientTitle: string;
    /** Сделка, к которой присоединена заявка (самая свежая). */
    mainDeal: IRepeatDealInfo;
    /** Остальные открытые сделки — возможные дубли, самые свежие в лимите. */
    otherDeals: IRepeatDealInfo[];
    /** Сколько открытых сделок сверх otherDeals — в текстах «и ещё N». */
    moreCount: number;
    /** Владельцы ВСЕХ открытых сделок клиента — их руководителям сообщение. */
    ownerIds: number[];
    /** Ответственный выбранной сделки ПОСЛЕ присоединения. */
    responsibleId: number;
}

/** Элемент пачки, уже решённый к присоединению (данные до записи). */
export interface IRepeatJoinNoticeSource {
    item: { leadId: number };
    leadContext: { lead: unknown };
    assignee: { responsible: number };
    join: { outcome: { resolution: IRepeatResolution } };
}

/** Другие открытые сделки для текстов: самые свежие в лимите + остаток. */
export function noticeOthersOf(resolution: IRepeatResolution): {
    deals: IRepeatDealInfo[];
    moreCount: number;
} {
    const all = otherOpenDeals(resolution);
    const deals = all.slice(0, MAX_REPEAT_NOTICE_OTHERS);
    return { deals, moreCount: all.length - deals.length };
}

/** Оповещать нужно только при нескольких открытых сделках; иначе null. */
export function repeatJoinNoticeOf(
    source: IRepeatJoinNoticeSource,
): IRepeatJoinNotice | null {
    const { resolution } = source.join.outcome;
    const mainDeal = resolution.mainDeal;
    if (resolution.kind !== 'ambiguous' || !mainDeal) return null;
    const others = noticeOthersOf(resolution);
    if (!others.deals.length) return null;
    return {
        leadId: source.item.leadId,
        clientTitle: clientTitleOf(rowOf(source.leadContext.lead), mainDeal),
        mainDeal,
        otherDeals: others.deals,
        moreCount: others.moreCount,
        ownerIds: [
            ...new Set(
                [mainDeal, ...otherOpenDeals(resolution)]
                    .map(deal => deal.responsibleId)
                    .filter((id): id is number => !!id),
            ),
        ],
        responsibleId: source.assignee.responsible,
    };
}

/**
 * Оповещаем только о РЕАЛЬНО записанном: у элемента нет ошибки, а
 * обновление выбранной сделки И привязка лида к ней есть среди ответов
 * батча. Без сделки «заявка присоединена» было бы неправдой; без привязки
 * лида его повторный прогон (страховка входа, SLA) присоединил бы заявку
 * снова и разослал бы всё ещё раз.
 */
export function joinedRepeatNotices(
    entries: readonly {
        error?: string;
        plan?: { dealCmd?: string; leadCmd?: string };
        repeat?: { notice: IRepeatJoinNotice | null };
    }[],
    byCmd: ReadonlyMap<string, unknown>,
): IRepeatJoinNotice[] {
    const notices: IRepeatJoinNotice[] = [];
    for (const entry of entries) {
        const notice = entry.repeat?.notice;
        const written = [entry.plan?.dealCmd, entry.plan?.leadCmd].every(
            cmd => !!cmd && byCmd.has(cmd),
        );
        if (notice && !entry.error && written) notices.push(notice);
    }
    return notices;
}

/** Название для текста: длинное — обрезается с многоточием. */
export function shortTitle(text: string): string {
    return text.length > NOTICE_TITLE_LIMIT
        ? `${text.slice(0, NOTICE_TITLE_LIMIT - 1)}…`
        : text;
}

/**
 * Клиент в тексте: компания из заявки → имя человека → название выбранной
 * сделки (его дают по клиенту) → название заявки. Название заявки —
 * последним: у формы сайта это «Заявка с сайта», то есть заявка, а не клиент.
 */
function clientTitleOf(lead: BxRow, mainDeal: IRepeatDealInfo): string {
    const person = [lead.NAME, lead.LAST_NAME].map(textOf).join(' ');
    const dealTitle =
        mainDeal.title.trim() === `#${mainDeal.dealId}` ? '' : mainDeal.title;
    for (const raw of [lead.COMPANY_TITLE, person, dealTitle, lead.TITLE]) {
        const text = textOf(raw);
        if (text) return shortTitle(text);
    }
    return `#${mainDeal.dealId}`;
}

function textOf(raw: unknown): string {
    return typeof raw === 'string' ? raw.trim() : '';
}

function rowOf(raw: unknown): BxRow {
    return raw && typeof raw === 'object' ? (raw as BxRow) : {};
}
