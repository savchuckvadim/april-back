import { bbBold, bbLink, bbSafe } from '@lib/rop-reports';
import {
    DEAL_MOVEMENT_DIGEST_MODE,
    type DealMovementDigestMode,
} from '@lib/portal-lib/store/app-settings';
import {
    DEAL_MOVEMENT_STATUS_TITLES,
    dealMovementShortDate,
    type DealMovementStatus,
} from '@lib/sales-ai-analytics';
import type { DealAuditDigest } from '../../deal-audit/services/deal-audit-digest-delivery';
import { DEAL_MOVEMENT_DIGEST } from '../constants/deal-movement.const';
import type { DealMovementDigestDeal } from '../types/deal-movement.types';
import {
    newDealMovementDigestDeals,
    topAtRiskDealMovementDigestDeals,
} from './deal-movement-digest-deals';

/**
 * Сводка «Движение сделок» руководителю — чистая вёрстка в BB-коде, по-
 * русски, без кодов. Длинная сводка для личных сообщений режется на части
 * (как у аудита сделок: уведомление и задача получают текст целиком).
 */

export const DEAL_MOVEMENT_DIGEST_TEXTS = {
    noOwner: 'ответственный не указан',
    noNew: 'Новых проблемных сделок за ночь нет.',
    closing:
        'Статус считает программа по стадиям сделки и разобранным звонкам.',
} as const;

/** Порядок статусов в шапке: от спокойных к тревожным. */
const COUNTS_ORDER: readonly DealMovementStatus[] = [
    'moving',
    'stuck',
    'rolled_back',
    'at_risk',
];

export interface DealMovementDigestInput {
    readonly domain: string;
    /** День портала 'YYYY-MM-DD'. */
    readonly day: string;
    /** Сделки набора получателя. */
    readonly deals: readonly DealMovementDigestDeal[];
    /** Сколько сделок под риском показывать. */
    readonly top: number;
    /** Имена ответственных из снимка структуры (`userNamesOf`). */
    readonly userNames: ReadonlyMap<number, string>;
}

/**
 * Слать ли сводку получателю: «только новые» — в наборе есть сделки,
 * ставшие этой ночью тревожными; «каждое утро» — есть хоть одна сделка не
 * «движется».
 */
export function shouldSendDealMovementDigest(
    deals: readonly DealMovementDigestDeal[],
    mode: DealMovementDigestMode,
): boolean {
    return mode === DEAL_MOVEMENT_DIGEST_MODE.daily
        ? deals.some(deal => deal.status !== 'moving')
        : newDealMovementDigestDeals(deals).length > 0;
}

/** «150 000 ₽» — разряды обычными пробелами; нет суммы — null. */
const amountText = (amount: number | null): string | null =>
    amount !== null && amount > 0
        ? `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`
        : null;

const dealUrl = (domain: string, dealId: string): string =>
    `https://${domain}/crm/deal/details/${dealId}/`;

const countsLine = (deals: readonly DealMovementDigestDeal[]): string =>
    COUNTS_ORDER.map(
        status =>
            `${DEAL_MOVEMENT_STATUS_TITLES[status]} — ${deals.filter(deal => deal.status === status).length}`,
    ).join(' · ');

/** Строка сделки: ссылка, ответственный, сумма; ниже — причины. */
function dealLines(
    input: DealMovementDigestInput,
    deal: DealMovementDigestDeal,
    transition: string | null,
): string[] {
    const owner =
        (deal.assignedById === null
            ? undefined
            : input.userNames.get(deal.assignedById)) ??
        DEAL_MOVEMENT_DIGEST_TEXTS.noOwner;
    const head = [
        bbLink(dealUrl(input.domain, deal.dealId), deal.title),
        bbSafe(owner),
        amountText(deal.amount),
    ]
        .filter((part): part is string => !!part)
        .join(' — ');
    const why = [transition, bbSafe(deal.reasons)]
        .filter((part): part is string => !!part)
        .join(': ');
    return [`>> ${head}`, `   ${why}`];
}

const transitionOf = (deal: DealMovementDigestDeal): string | null =>
    deal.newFrom === null
        ? null
        : `${DEAL_MOVEMENT_STATUS_TITLES[deal.newFrom]} → ${DEAL_MOVEMENT_STATUS_TITLES[deal.status]}`;

/** Разделы сводки: шапка и новые, под риском, итоговая строка. */
function sections(input: DealMovementDigestInput): string[][] {
    const fresh = newDealMovementDigestDeals(input.deals);
    const shown = fresh.slice(0, DEAL_MOVEMENT_DIGEST.newLimit);
    const atRisk = topAtRiskDealMovementDigestDeals(
        input.deals,
        input.top,
        new Set(shown.map(deal => deal.dealId)),
    );
    const head = [
        bbBold(`Движение сделок за ${dealMovementShortDate(input.day)}`),
        countsLine(input.deals),
        '',
    ];
    if (shown.length === 0) {
        head.push(DEAL_MOVEMENT_DIGEST_TEXTS.noNew);
    } else {
        head.push(bbBold(`Новые за ночь — ${fresh.length}`));
        for (const deal of shown) {
            head.push(...dealLines(input, deal, transitionOf(deal)));
        }
        if (fresh.length > shown.length) {
            head.push(`[i]…и ещё ${fresh.length - shown.length}[/i]`);
        }
    }
    const risk: string[] = [];
    if (atRisk.length > 0) {
        risk.push(bbBold(`Под риском — первые ${atRisk.length} по сумме`));
        for (const deal of atRisk) risk.push(...dealLines(input, deal, null));
    }
    return [head, risk, [`[i]${DEAL_MOVEMENT_DIGEST_TEXTS.closing}[/i]`]];
}

/** Строки → сообщения не длиннее предела (строка не разрывается). */
function splitByLength(lines: readonly string[], max: number): string[] {
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

/**
 * Сводка одного получателя: текст целиком (уведомление, задача) и серия
 * сообщений не длиннее предела. Сделок нет — null.
 */
export function buildDealMovementDigest(
    input: DealMovementDigestInput,
): DealAuditDigest | null {
    if (input.deals.length === 0) return null;
    const lines = sections(input).flatMap((section, index) =>
        index === 0 || section.length === 0 ? section : ['', ...section],
    );
    return {
        heading: `Движение сделок за ${dealMovementShortDate(input.day)}`,
        count: input.deals.filter(deal => deal.status !== 'moving').length,
        text: lines.join('\n').trim(),
        messages: splitByLength(lines, DEAL_MOVEMENT_DIGEST.messageMax),
    };
}
