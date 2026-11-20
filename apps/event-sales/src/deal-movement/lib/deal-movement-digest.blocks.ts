import { bbLink, bbSafe } from '@lib/rop-reports';
import {
    DEAL_MOVEMENT_STATUS_TITLES,
    type DealMovementStatus,
} from '@lib/sales-ai-analytics';
import type { DealMovementDigestDeal } from '../types/deal-movement.types';

/**
 * Общие кирпичи сводок «Движение сделок» руководителю (ежедневной и за
 * период): строка сделки, счёт по статусам, резка на сообщения. BB-код,
 * по-русски, без кодов; подписи статусов — из одного места
 * (`DEAL_MOVEMENT_STATUS_TITLES`). Чистые функции.
 */

export const DEAL_MOVEMENT_DIGEST_TEXTS = {
    noOwner: 'ответственный не указан',
    noNew: 'Новых проблемных сделок за ночь нет.',
    auditCount: 'Из них забыты по аудиту',
    closing:
        'Статус считает программа по стадиям сделки, звонкам и делам по ней.',
} as const;

/**
 * Порядок статусов в шапке и ночном итоге: от спокойных к тревожным
 * (решение 20.11.2026: «Движется · Без продвижения · Без внимания ·
 * Вернулась назад · Под риском»).
 */
export const DEAL_MOVEMENT_COUNTS_ORDER: readonly DealMovementStatus[] = [
    'moving',
    'stuck',
    'abandoned',
    'rolled_back',
    'at_risk',
];

/** Получатель сводки: портал, сделки его набора и имена ответственных. */
export interface DealMovementDigestScope {
    readonly domain: string;
    /** Сделки набора получателя. */
    readonly deals: readonly DealMovementDigestDeal[];
    /** Имена ответственных из снимка структуры (`userNamesOf`). */
    readonly userNames: ReadonlyMap<number, string>;
}

/** «150 000 ₽» — разряды обычными пробелами; нет суммы — null. */
const amountText = (amount: number | null): string | null =>
    amount !== null && amount > 0
        ? `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
        : null;

const dealUrl = (domain: string, dealId: string): string =>
    `https://${domain}/crm/deal/details/${dealId}/`;

/** «Движется — 120 · Без продвижения — 14 · …» по заданным числам. */
export const dealMovementCountsText = (
    countOf: (status: DealMovementStatus) => number,
    order: readonly DealMovementStatus[] = DEAL_MOVEMENT_COUNTS_ORDER,
): string =>
    order
        .map(
            status =>
                `${DEAL_MOVEMENT_STATUS_TITLES[status]} — ${countOf(status)}`,
        )
        .join(' · ');

/** Счёт по статусам набора сделок. */
export const dealMovementCountsLine = (
    deals: readonly DealMovementDigestDeal[],
): string =>
    dealMovementCountsText(
        status => deals.filter(deal => deal.status === status).length,
    );

/**
 * Строка сделки: ссылка, ответственный, сумма; ниже — `why` (по умолчанию
 * причины статуса) и пометка аудита.
 */
export function dealMovementDealLines(
    scope: DealMovementDigestScope,
    deal: DealMovementDigestDeal,
    lead: string | null,
    why: string = deal.reasons,
): string[] {
    const owner =
        (deal.assignedById === null
            ? undefined
            : scope.userNames.get(deal.assignedById)) ??
        DEAL_MOVEMENT_DIGEST_TEXTS.noOwner;
    const head = [
        bbLink(dealUrl(scope.domain, deal.dealId), deal.title),
        bbSafe(owner),
        amountText(deal.amount),
    ]
        .filter((part): part is string => !!part)
        .join(' — ');
    const line = [lead, bbSafe(why)]
        .filter((part): part is string => !!part)
        .join(': ');
    // Находка аудита — пометкой под причинами; статус она не меняет.
    return deal.audit === null
        ? [`>> ${head}`, `   ${line}`]
        : [`>> ${head}`, `   ${line}`, `   [i]${bbSafe(deal.audit)}[/i]`];
}

/** «Из них забыты по аудиту: N» — только если такие есть. */
export const dealMovementAuditCountLine = (
    deals: readonly DealMovementDigestDeal[],
): string | null => {
    const count = deals.filter(deal => deal.audit !== null).length;
    return count > 0
        ? `${DEAL_MOVEMENT_DIGEST_TEXTS.auditCount}: ${count}`
        : null;
};

/** Было → стало словами: «Движется → Без внимания». */
export const dealMovementTransitionText = (
    from: DealMovementStatus,
    to: DealMovementStatus,
): string =>
    `${DEAL_MOVEMENT_STATUS_TITLES[from]} → ${DEAL_MOVEMENT_STATUS_TITLES[to]}`;

/** Раздел-список: заголовок и строки сделок; сделок нет — пусто. */
export function dealMovementListSection(
    scope: DealMovementDigestScope,
    title: string,
    deals: readonly DealMovementDigestDeal[],
    whyOf?: (deal: DealMovementDigestDeal) => string,
): string[] {
    if (deals.length === 0) return [];
    return [
        title,
        ...deals.flatMap(deal =>
            dealMovementDealLines(scope, deal, null, whyOf?.(deal)),
        ),
    ];
}

/** Строки → сообщения не длиннее предела (строка не разрывается). */
export function splitDealMovementDigest(
    lines: readonly string[],
    max: number,
): string[] {
    const parts: string[] = [];
    let current: string[] = [];
    let length = 0;
    for (const line of lines) {
        if (current.length > 0 && length + line.length + 1 > max) {
            parts.push(current.join('\n').trim());
            current = [];
            length = 0;
        }
        current.push(line);
        length += line.length + 1;
    }
    if (current.length > 0) parts.push(current.join('\n').trim());
    return parts.filter(Boolean);
}

/** Разделы → строки сводки: между разделами пустая строка. */
export const joinDealMovementSections = (
    sections: readonly (readonly string[])[],
): string[] =>
    sections.flatMap((section, index) =>
        index === 0 || section.length === 0 ? [...section] : ['', ...section],
    );
