/**
 * ТЕКСТЫ о повторной заявке для сотрудников продаж (решения владельца
 * 28.09 и 01.10.2026): по-русски, без кодов и жаргона, у каждого — что
 * сделать. Таймлайн — HTML-хелперы timeline.consts (BB-код там приезжает
 * сырым), уведомления im.notify — BB-ссылки `[URL=…]…[/URL]`.
 *
 * Строки таймлайна собираются для ПРЯМОГО вызова (toTimelineCommentDirect).
 */
import {
    crmCardUrl,
    timelineBold,
    timelineLink,
    timelineLinkLine,
    timelineText,
} from '@lib/bitrix/consts/timeline.consts';
import { ruPluralForm } from '@lib/sales-ai-analytics/model/ru-text.util';
import {
    describeRepeatResolution,
    IRepeatDealInfo,
    IRepeatResolution,
} from './repeat-work.resolver';
import {
    IRepeatJoinNotice,
    noticeOthersOf,
    shortTitle,
} from './repeat-join-notice';

/** id сотрудника → имя (UserNameResolver пачки). */
export type RepeatNoticeNames = Readonly<Record<number, string>>;

const MERGE_HINT = 'Руководитель может объединить работу клиента в «Звонках».';
const DRY_RUN_HINT =
    'Сейчас создана отдельная работа (режим «холостой ход» в настройках портала).';

/** Имя сотрудника; не разрезолвилось — «сотрудник 447»; нет — null. */
export function personOf(
    names: RepeatNoticeNames,
    id: number | null,
): string | null {
    if (!id) return null;
    return names[id] ?? `сотрудник ${id}`;
}

/* ------------------------------------------------------------------ *
 * Таймлайн
 * ------------------------------------------------------------------ */

/** Выбранная сделка: почему заявка здесь и какие сделки ещё открыты. */
export function chosenDealCommentLines(
    domain: string,
    notice: IRepeatJoinNotice,
    names: RepeatNoticeNames,
): string[] {
    const others = notice.otherDeals
        .map(deal => timelineDeal(domain, deal, ownerOf(names, deal)))
        .join('; ');
    return [
        timelineBold('🔁 Повторная заявка присоединена к этой сделке'),
        leadRef(domain, notice.leadId) +
            timelineText(
                ': эта сделка самая свежая из открытых сделок клиента.',
            ),
        `${timelineText('Ещё открыты:')} ${others}${andMore(notice.moreCount)}.`,
        timelineText(MERGE_HINT),
    ];
}

/** Другая открытая сделка клиента — возможный дубль. */
export function otherDealCommentLines(
    domain: string,
    notice: IRepeatJoinNotice,
    names: RepeatNoticeNames,
): string[] {
    return [
        timelineBold('🔁 По клиенту пришла повторная заявка'),
        leadRef(domain, notice.leadId) +
            timelineText('. Заявка присоединена к сделке ') +
            chosenDeal(domain, notice, names) +
            timelineText(' — самой свежей из открытых сделок клиента.'),
        timelineText(
            'Эта сделка — возможный дубль: руководитель решит, объединять ли.',
        ),
    ];
}

/** Лид: куда ушла заявка (вместо прежнего «нужен выбор»). */
export function leadJoinedNoteLines(
    domain: string,
    notice: IRepeatJoinNotice,
    names: RepeatNoticeNames,
): string[] {
    const others = notice.otherDeals
        .map(deal => timelineDeal(domain, deal, ownerOf(names, deal), true))
        .join(', ');
    return [
        timelineBold(
            '🔁 Повторная заявка присоединена к самой свежей сделке клиента',
        ),
        `${timelineText('Сделка:')} ${chosenDeal(domain, notice, names)}`,
        `${timelineText('У клиента есть ещё открытые сделки:')} ${others}${andMore(notice.moreCount)}.`,
        timelineText('Руководитель может объединить их в «Звонках».'),
    ];
}

/**
 * Холостой ход: что сделал бы режим «присоединять». Одна открытая —
 * прежний текст; несколько — самая свежая и остальные открытые.
 */
export function dryRunNoteLines(
    domain: string,
    resolution: IRepeatResolution,
    names: RepeatNoticeNames,
): string[] {
    const main = resolution.mainDeal;
    if (!main) return [];
    const heading = timelineBold('🔁 Повторная заявка — холостой ход');
    if (resolution.kind === 'join') {
        return [
            heading,
            timelineText(
                `Присоединил бы к работе клиента: ${describeRepeatResolution(resolution)}.`,
            ),
            timelineLinkLine(
                'Сделка',
                dealUrl(domain, main.dealId),
                `#${main.dealId}`,
            ),
            timelineText(DRY_RUN_HINT),
        ];
    }
    if (resolution.kind !== 'ambiguous') return [];
    const { deals, moreCount } = noticeOthersOf(resolution);
    const others = deals
        .map(deal => timelineDeal(domain, deal, ownerOf(names, deal), true))
        .join(', ');
    return [
        heading,
        timelineText(
            'Присоединил бы к самой свежей из открытых сделок клиента: ',
        ) + timelineDeal(domain, main, ownerOf(names, main), true),
        `${timelineText('Ещё открыты:')} ${others}${andMore(moreCount)}.`,
        timelineText(DRY_RUN_HINT),
    ];
}

/* ------------------------------------------------------------------ *
 * Уведомления (im.notify, BB-код)
 * ------------------------------------------------------------------ */

/** Менеджеру других открытых сделок клиента — одно сообщение на человека. */
export function managerNoticeMessage(
    domain: string,
    notice: IRepeatJoinNotice,
    ownDeals: readonly IRepeatDealInfo[],
    names: RepeatNoticeNames,
): string {
    const own = ownDeals.map(deal => bbDeal(domain, deal.dealId)).join(', ');
    const tail =
        ownDeals.length > 1
            ? `Ваши сделки ${own} по этому клиенту тоже открыты`
            : `Ваша сделка ${own} по этому клиенту тоже открыта`;
    const chosenPerson = personOf(names, notice.responsibleId);
    return (
        `По вашему клиенту «${bbText(notice.clientTitle)}» пришла повторная ` +
        `заявка (${bbLead(domain, notice.leadId)}) — она ушла в сделку ` +
        bbDeal(domain, notice.mainDeal.dealId) +
        (chosenPerson ? ` (${bbText(chosenPerson)})` : '') +
        `, самую свежую работу клиента. ${tail} — руководитель решит, ` +
        'объединять ли.'
    );
}

/** Руководителям владельцев всех открытых сделок клиента. */
export function headNoticeMessage(
    domain: string,
    notice: IRepeatJoinNotice,
    names: RepeatNoticeNames,
): string {
    const count = notice.otherDeals.length + 1 + notice.moreCount;
    const deals = [
        { dealId: notice.mainDeal.dealId, ownerId: notice.responsibleId },
        ...notice.otherDeals.map(deal => ({
            dealId: deal.dealId,
            ownerId: deal.responsibleId,
        })),
    ]
        .map(deal => {
            const person = personOf(names, deal.ownerId);
            return (
                bbDeal(domain, deal.dealId) +
                (person ? ` — ${bbText(person)}` : '')
            );
        })
        .join(', ');
    const dealsWord = ruPluralForm(count, [
        'открытая сделка',
        'открытые сделки',
        'открытых сделок',
    ]);
    return (
        `Повторная заявка (${bbLead(domain, notice.leadId)}) по клиенту ` +
        `«${bbText(notice.clientTitle)}»: у клиента ${count} ${dealsWord} ` +
        `(${deals}${andMore(notice.moreCount)}). Заявка присоединена к самой свежей — ` +
        `${bbDeal(domain, notice.mainDeal.dealId)}. ` +
        'Объединить работу клиента можно в «Звонках».'
    );
}

/* ------------------------------------------------------------------ */

const dealUrl = (domain: string, dealId: number): string =>
    crmCardUrl(domain, 'deal', dealId);

const ownerOf = (
    names: RepeatNoticeNames,
    deal: IRepeatDealInfo,
): string | null => personOf(names, deal.responsibleId);

const leadRef = (domain: string, leadId: number): string =>
    `${timelineText('Лид')} ${timelineLink(crmCardUrl(domain, 'lead', leadId), `#${leadId}`)}`;

/**
 * `#A «Название» — Имя` (или `… (Имя)`) для таймлайна; без названия,
 * если его нет, и без имени, если ответственного нет.
 */
function timelineDeal(
    domain: string,
    deal: IRepeatDealInfo,
    person: string | null,
    personInParens = false,
): string {
    const title = titleOf(deal);
    const personText = person
        ? personInParens
            ? ` (${person})`
            : ` — ${person}`
        : '';
    return (
        timelineLink(dealUrl(domain, deal.dealId), `#${deal.dealId}`) +
        timelineText(`${title ? ` «${title}»` : ''}${personText}`)
    );
}

/** Выбранная сделка с ответственным ПОСЛЕ присоединения: `#A «…» (Имя)`. */
const chosenDeal = (
    domain: string,
    notice: IRepeatJoinNotice,
    names: RepeatNoticeNames,
): string =>
    timelineDeal(
        domain,
        notice.mainDeal,
        personOf(names, notice.responsibleId),
        true,
    );

/** Название сделки для текста; заглушка `#id` файндера — не название. */
function titleOf(deal: IRepeatDealInfo): string | null {
    const title = deal.title.trim();
    if (!title || title === `#${deal.dealId}`) return null;
    return shortTitle(title);
}

/** Сделки сверх лимита оповещений — числом: « и ещё 15». */
const andMore = (count: number): string => (count > 0 ? ` и ещё ${count}` : '');

/** Квадратные скобки в тексте ломали бы BB-разметку уведомления. */
const bbText = (text: string): string => text.replace(/[[\]]/g, '');

const bbDeal = (domain: string, dealId: number): string =>
    `[URL=${dealUrl(domain, dealId)}]#${dealId}[/URL]`;

const bbLead = (domain: string, leadId: number): string =>
    `[URL=${crmCardUrl(domain, 'lead', leadId)}]лид #${leadId}[/URL]`;
