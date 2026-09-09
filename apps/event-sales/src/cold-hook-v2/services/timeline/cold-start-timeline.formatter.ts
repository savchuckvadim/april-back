import { BATCH_LINE_BREAK_SYMBOL } from '@lib/bitrix/consts/batch.consts';
import { BitrixEntityType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { UserNameMap } from '../../../shared/lead-request/user-name.resolver';
import {
    ColdStartDecision,
    ForeignOpenDeal,
} from '../../lib/cold-force.decision';
import { ColdCloseResult } from '../relations/cold-relations-closer.service';
import { ColdTarget } from '../target/cold-target.types';

/**
 * Записи таймлайна и push-уведомления холодного старта (шаг 7 плана v2) —
 * чистый форматтер.
 *
 * Куда пишем:
 *  - `proceed`: сущность-корень (компания; у клиента без компании — входная
 *    сделка и сохранённая основная) — итог закрытия со ссылками; а если
 *    клиента ЗАБРАЛИ у другого сотрудника (`force=Y`) — ещё в его основную
 *    и push ему: «у вас забрали клиента»;
 *  - `yield`: туда же — «уступлено, кому», и КАЖДОМУ владельцу чужой
 *    открытой основной — «попытка взять вашу компанию в работу» плюс push
 *    «у вас попытались забрать» (решение владельца 02.09, вечер);
 *  - входная сделка, оказавшаяся чужой основной (`takenEntry`), забирается
 *    в любом режиме — её владельцу «забрали» и push всегда.
 *
 * BB-код таймлайна: `[B]` и `[URL=]`; переносы в batch-командах — символ
 * batch-провода, в push (прямой вызов im.notify) — обычный перевод строки.
 */

export interface TimelineEntry {
    entityType: BitrixEntityType;
    entityId: number;
    comment: string;
}

/** Push сотруднику, у которого забрали или попытались забрать клиента. */
export interface ColdStartPush {
    userId: number;
    message: string;
    /**
     * Тег группировки: уведомления по ТОМУ ЖЕ клиенту тому же сотруднику
     * замещают друг друга. Собирается из клиента, а не из ключа хука: ключ
     * уникален только внутри одного окна тишины (ревью 02.09).
     */
    tag: string;
}

export interface ColdStartTimelineInput {
    domain: string;
    target: ColdTarget;
    decision: ColdStartDecision;
    closed: ColdCloseResult;
    /** Ответственный холодного старта — `responsible` хука. */
    responsibleId: number;
    names: UserNameMap;
}

/** Сколько ссылок на закрытые сделки помещаем в запись; дальше — «и ещё N». */
const CLOSED_LINKS_LIMIT = 10;

const NL = BATCH_LINE_BREAK_SYMBOL;

export const dealUrl = (domain: string, id: number): string =>
    `https://${domain}/crm/deal/details/${id}/`;
export const companyUrl = (domain: string, id: number): string =>
    `https://${domain}/crm/company/details/${id}/`;

const link = (url: string, text: string): string => `[URL=${url}]${text}[/URL]`;

/** Имя сотрудника; портал не ответил — честный id, а не пустота. */
export const personName = (names: UserNameMap, id: number): string =>
    names[id] || `сотрудник #${id}`;

/** Клиент как ключ тега push: компания либо входная сделка. */
export const clientKey = (target: ColdTarget): string =>
    target.kind === 'company' && target.companyId
        ? `co_${target.companyId}`
        : `d_${target.entryDeal?.ID ?? 0}`;

const closedSummary = (closed: ColdCloseResult): string =>
    `сделок — ${closed.closedDealIds.length}, задач — ${closed.completedTaskIds.length}, ` +
    `презентаций — ${closed.closedPresIds.length}, ЗПР — ${closed.closedZprIds.length}`;

const closedDealLinks = (domain: string, ids: number[]): string => {
    if (!ids.length) return '';
    const shown = ids
        .slice(0, CLOSED_LINKS_LIMIT)
        .map(id => link(dealUrl(domain, id), `#${id}`))
        .join(', ');
    const rest = ids.length - CLOSED_LINKS_LIMIT;
    return `Закрытые сделки: ${shown}${rest > 0 ? ` и ещё ${rest}` : ''}.`;
};

/** Сущности, где менеджер ищет след холодного старта. */
const entryEntities = (
    input: ColdStartTimelineInput,
): Array<Pick<TimelineEntry, 'entityType' | 'entityId'>> => {
    const { target, closed, decision } = input;
    const out: Array<Pick<TimelineEntry, 'entityType' | 'entityId'>> = [];
    const seen = new Set<string>();
    const push = (entityType: BitrixEntityType, entityId: number | null) => {
        if (!entityId) return;
        const key = `${entityType}_${entityId}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ entityType, entityId });
    };
    if (target.kind === 'company') {
        push(BitrixEntityType.COMPANY, target.companyId);
    }
    push(
        BitrixEntityType.DEAL,
        target.entryDeal ? Number(target.entryDeal.ID) : null,
    );
    if (decision.mode === 'proceed' && closed.preservedBaseDeal) {
        push(BitrixEntityType.DEAL, Number(closed.preservedBaseDeal.ID));
    }
    return out;
};

/** «Входная сделка: …; компания: …» — с большой буквы и точкой; пусто — ''. */
const entryLinksLine = (input: ColdStartTimelineInput): string => {
    const { target, domain } = input;
    const parts: string[] = [];
    if (target.entryDeal) {
        const id = Number(target.entryDeal.ID);
        parts.push(`входная сделка: ${link(dealUrl(domain, id), `#${id}`)}`);
    }
    if (target.kind === 'company' && target.companyId) {
        parts.push(
            `компания: ${link(companyUrl(domain, target.companyId), `#${target.companyId}`)}`,
        );
    }
    if (!parts.length) return '';
    const line = parts.join('; ');
    return `${line[0].toUpperCase()}${line.slice(1)}.`;
};

const whoseClient = (target: ColdTarget): string =>
    target.kind === 'company' ? 'вашу компанию' : 'вашего клиента';

/** «компанию» / «клиента» — для «У вас забрали … в работу». */
const whatClient = (target: ColdTarget): string =>
    target.kind === 'company' ? 'компанию' : 'клиента';

const takenComment = (
    input: ColdStartTimelineInput,
    responsible: string,
    links: string,
): string =>
    [
        `[B]${capitalize(whoseClient(input.target))} забрали в работу[/B]: ${responsible} (ответственный холодного старта).`,
        links,
        `Ваша работа по клиенту закрыта или переназначена: ${closedSummary(input.closed)}.`,
    ]
        .filter(Boolean)
        .join(NL);

export const buildColdStartTimeline = (
    input: ColdStartTimelineInput,
): TimelineEntry[] => {
    const { domain, decision, closed, names, responsibleId, target } = input;
    const responsible = personName(names, responsibleId);
    const links = entryLinksLine(input);
    const taken = takenComment(input, responsible, links);

    if (decision.mode === 'proceed') {
        const comment = [
            `[B]Холодный старт[/B] — ответственный: ${responsible}.`,
            `Закрыто: ${closedSummary(closed)}.`,
            closedDealLinks(domain, closed.closedDealIds),
        ]
            .filter(Boolean)
            .join(NL);
        const entries: TimelineEntry[] = entryEntities(input).map(entity => ({
            ...entity,
            comment,
        }));
        // force=Y: у кого забрали — след в их основной сделке.
        for (const foreignDeal of [
            ...decision.foreign,
            ...takenList(decision),
        ]) {
            entries.push({
                entityType: BitrixEntityType.DEAL,
                entityId: foreignDeal.dealId,
                comment: taken,
            });
        }
        return entries;
    }

    const [primary] = decision.foreign;
    const owner = personName(names, primary.responsibleId);
    const entryComment = [
        `[B]Холодный старт уступлен[/B]: клиент в работе у ${owner} ` +
            `(${link(dealUrl(domain, primary.dealId), `сделка #${primary.dealId}`)}).`,
        `Закрыты только входная сделка и её связи: ${closedSummary(closed)}. ` +
            'Новая работа не создана.',
    ].join(NL);
    const entries: TimelineEntry[] = entryEntities(input).map(entity => ({
        ...entity,
        comment: entryComment,
    }));

    for (const foreignDeal of decision.foreign) {
        entries.push({
            entityType: BitrixEntityType.DEAL,
            entityId: foreignDeal.dealId,
            comment: [
                `[B]Попытка взять ${whoseClient(target)} в работу[/B]: ${responsible} (ответственный холодного старта).`,
                links,
                'Уступлено — ваша работа не тронута.',
            ]
                .filter(Boolean)
                .join(NL),
        });
    }
    // Входная — чужая основная: её закрыли и в yield, владельцу — «забрали».
    for (const takenDeal of takenList(decision)) {
        entries.push({
            entityType: BitrixEntityType.DEAL,
            entityId: takenDeal.dealId,
            comment: taken,
        });
    }
    return entries;
};

const takenList = (decision: ColdStartDecision): ForeignOpenDeal[] =>
    decision.takenEntry ? [decision.takenEntry] : [];

interface PushRecipient {
    taken: boolean;
    dealIds: number[];
}

/**
 * Push каждому сотруднику, у которого забрали (`proceed`, либо входная —
 * его основная) или попытались забрать (`yield`) клиента — один на человека,
 * сколько бы сделок у него ни было; «забрали» сильнее «попытались».
 * Переносы — `\n`: im.notify зовётся напрямую, не батчем.
 */
export const buildColdStartPushes = (
    input: ColdStartTimelineInput,
): ColdStartPush[] => {
    const { decision, names, responsibleId, target, domain } = input;
    const recipients = new Map<number, PushRecipient>();
    const add = (deal: ForeignOpenDeal, taken: boolean) => {
        const current = recipients.get(deal.responsibleId) ?? {
            taken: false,
            dealIds: [],
        };
        current.taken = current.taken || taken;
        current.dealIds.push(deal.dealId);
        recipients.set(deal.responsibleId, current);
    };
    for (const deal of decision.foreign) add(deal, decision.mode === 'proceed');
    for (const deal of takenList(decision)) add(deal, true);
    if (!recipients.size) return [];

    const responsible = personName(names, responsibleId);
    const links = entryLinksLine(input);
    const what = whatClient(target);

    return [...recipients.entries()].map(([userId, recipient]) => {
        const title = recipient.taken
            ? `[B]У вас забрали ${what} в работу[/B]`
            : `[B]У вас попытались забрать ${what} в работу[/B]`;
        const tail = recipient.taken
            ? 'Ваша работа по клиенту закрыта или переназначена.'
            : 'Уступлено — ваша работа не тронута.';
        const own = recipient.dealIds
            .map(id => link(dealUrl(domain, id), `#${id}`))
            .join(', ');
        return {
            userId,
            message: [
                `${title}: ${responsible} (ответственный холодного старта).`,
                links,
                `Ваши сделки: ${own}.`,
                tail,
            ]
                .filter(Boolean)
                .join('\n'),
            tag: `xo2_cold_start_${clientKey(target)}_${userId}`,
        };
    });
};

const capitalize = (text: string): string =>
    text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
