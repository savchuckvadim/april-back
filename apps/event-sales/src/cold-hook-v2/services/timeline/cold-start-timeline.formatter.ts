import {
    crmCardUrl,
    timelineBold,
    timelineLink,
} from '@lib/bitrix/consts/timeline.consts';
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
 * РАЗМЕТКА — РАЗНАЯ У ДВУХ ПРОВОДОВ, и путать их нельзя:
 *  - запись ТАЙМЛАЙНА — HTML (`<b>`, `<a href>`): BB-код `[URL=]` в карточке
 *    доезжает сырым текстом (см. `@lib/bitrix/consts/timeline.consts`);
 *  - push (`im.notify`) — BB-код (`[B]`, `[URL=]`): там он и рендерится.
 *
 * Переносы В ОБОИХ случаях обычные `\n`. Запись таймлайна уезжает
 * batch-командой, и её экранирование — забота транспорта
 * (`ColdStartTimelineV2Service` → `toTimelineComment`), а не текста:
 * экранировать здесь значило бы делать это дважды. Push зовёт im.notify
 * напрямую и не экранируется вовсе.
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

/**
 * Разделитель строк — обычный перевод строки. Под batch его готовит
 * транспорт записи таймлайна; push уходит с ним как есть.
 */
const NL = '\n';

export const dealUrl = (domain: string, id: number): string =>
    crmCardUrl(domain, 'deal', id);
export const companyUrl = (domain: string, id: number): string =>
    crmCardUrl(domain, 'company', id);

/** Ссылка записи ТАЙМЛАЙНА — HTML. */
const link = timelineLink;

/** Ссылка PUSH-сообщения — BB-код: im.notify рендерит именно его. */
const pushLink = (url: string, text: string): string =>
    `[URL=${url}]${text}[/URL]`;

/** Жирный заголовок push — тоже BB-код. */
const pushBold = (text: string): string => `[B]${text}[/B]`;

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

/**
 * Рендер ссылки — параметр, а не константа: один и тот же список сделок
 * уезжает и в таймлайн (HTML), и в push (BB-код).
 */
type LinkRenderer = (url: string, text: string) => string;

const closedDealLinks = (
    domain: string,
    ids: number[],
    renderLink: LinkRenderer,
): string => {
    if (!ids.length) return '';
    const shown = ids
        .slice(0, CLOSED_LINKS_LIMIT)
        .map(id => renderLink(dealUrl(domain, id), `#${id}`))
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
const entryLinksLine = (
    input: ColdStartTimelineInput,
    renderLink: LinkRenderer,
): string => {
    const { target, domain } = input;
    const parts: string[] = [];
    if (target.entryDeal) {
        const id = Number(target.entryDeal.ID);
        parts.push(
            `входная сделка: ${renderLink(dealUrl(domain, id), `#${id}`)}`,
        );
    }
    if (target.kind === 'company' && target.companyId) {
        parts.push(
            `компания: ${renderLink(companyUrl(domain, target.companyId), `#${target.companyId}`)}`,
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
        `${timelineBold(`${capitalize(whoseClient(input.target))} забрали в работу`)}: ${responsible} (ответственный холодного старта).`,
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
    const links = entryLinksLine(input, link);
    const taken = takenComment(input, responsible, links);

    if (decision.mode === 'proceed') {
        const comment = [
            `${timelineBold('Холодный старт')} — ответственный: ${responsible}.`,
            `Закрыто: ${closedSummary(closed)}.`,
            closedDealLinks(domain, closed.closedDealIds, link),
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
        `${timelineBold('Холодный старт уступлен')}: клиент в работе у ${owner} ` +
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
                `${timelineBold(`Попытка взять ${whoseClient(target)} в работу`)}: ${responsible} (ответственный холодного старта).`,
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
    // Push рендерится BB-кодом — своим рендером ссылок, не таймлайновым.
    const links = entryLinksLine(input, pushLink);
    const what = whatClient(target);

    return [...recipients.entries()].map(([userId, recipient]) => {
        const title = recipient.taken
            ? pushBold(`У вас забрали ${what} в работу`)
            : pushBold(`У вас попытались забрать ${what} в работу`);
        const tail = recipient.taken
            ? 'Ваша работа по клиенту закрыта или переназначена.'
            : 'Уступлено — ваша работа не тронута.';
        const own = recipient.dealIds
            .map(id => pushLink(dealUrl(domain, id), `#${id}`))
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
