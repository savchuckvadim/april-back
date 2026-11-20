import { bbBold } from '@lib/rop-reports';
import {
    DEAL_MOVEMENT_DIGEST_MODE,
    dealMovementDigestPeriodDays,
    type DealMovementDigestMode,
} from '@lib/portal-lib/store/app-settings';
import { dealMovementShortDate } from '@lib/sales-ai-analytics';
import type { DealAuditDigest } from '../../deal-audit/services/deal-audit-digest-delivery';
import { DEAL_MOVEMENT_DIGEST } from '../constants/deal-movement.const';
import type { DealMovementDigestDeal } from '../types/deal-movement.types';
import {
    DEAL_MOVEMENT_DIGEST_TEXTS,
    dealMovementAuditCountLine,
    dealMovementCountsLine,
    dealMovementDealLines,
    dealMovementListSection,
    dealMovementTransitionText,
    joinDealMovementSections,
    splitDealMovementDigest,
    type DealMovementDigestScope,
} from './deal-movement-digest.blocks';
import {
    newDealMovementDigestDeals,
    topAtRiskDealMovementDigestDeals,
} from './deal-movement-digest-deals';

/**
 * Ежедневная сводка «Движение сделок» руководителю («только новые» и
 * «каждое утро») — чистая вёрстка в BB-коде, по-русски, без кодов.
 * Длинная сводка для личных сообщений режется на части (как у аудита
 * сделок: уведомление и задача получают текст целиком). Сводка за период
 * — `deal-movement-period-digest.formatter.ts`.
 */

export { DEAL_MOVEMENT_DIGEST_TEXTS } from './deal-movement-digest.blocks';

export interface DealMovementDigestInput extends DealMovementDigestScope {
    /** День портала 'YYYY-MM-DD'. */
    readonly day: string;
    /** Сколько сделок под риском показывать. */
    readonly top: number;
}

/**
 * Слать ли сводку получателю: «только новые» — в наборе есть сделки,
 * которые этой ночью перестали двигаться или которым стало хуже; «каждое
 * утро» и сводки за период — есть хоть одна сделка не «движется».
 */
export function shouldSendDealMovementDigest(
    deals: readonly DealMovementDigestDeal[],
    mode: DealMovementDigestMode,
): boolean {
    return mode === DEAL_MOVEMENT_DIGEST_MODE.daily ||
        dealMovementDigestPeriodDays(mode) !== null
        ? deals.some(deal => deal.status !== 'moving')
        : newDealMovementDigestDeals(deals).length > 0;
}

/** Разделы сводки: шапка и новые, под риском, итоговая строка. */
function sections(input: DealMovementDigestInput): string[][] {
    const fresh = newDealMovementDigestDeals(input.deals);
    const shown = fresh.slice(0, DEAL_MOVEMENT_DIGEST.newLimit);
    const atRisk = topAtRiskDealMovementDigestDeals(
        input.deals,
        input.top,
        new Set(shown.map(deal => deal.dealId)),
    );
    const auditCount = dealMovementAuditCountLine(input.deals);
    const head = [
        bbBold(`Движение сделок за ${dealMovementShortDate(input.day)}`),
        dealMovementCountsLine(input.deals),
        ...(auditCount === null ? [] : [auditCount]),
        '',
    ];
    if (shown.length === 0) {
        head.push(DEAL_MOVEMENT_DIGEST_TEXTS.noNew);
    } else {
        head.push(bbBold(`Новые за ночь — ${fresh.length}`));
        for (const deal of shown) {
            const lead =
                deal.newFrom === null
                    ? null
                    : dealMovementTransitionText(deal.newFrom, deal.status);
            head.push(...dealMovementDealLines(input, deal, lead));
        }
        if (fresh.length > shown.length) {
            head.push(`[i]…и ещё ${fresh.length - shown.length}[/i]`);
        }
    }
    const risk = dealMovementListSection(
        input,
        bbBold(`Под риском — первые ${atRisk.length} по сумме`),
        atRisk,
    );
    return [head, risk, [`[i]${DEAL_MOVEMENT_DIGEST_TEXTS.closing}[/i]`]];
}

/**
 * Сводка одного получателя: текст целиком (уведомление, задача) и серия
 * сообщений не длиннее предела. Сделок нет — null.
 */
export function buildDealMovementDigest(
    input: DealMovementDigestInput,
): DealAuditDigest | null {
    if (input.deals.length === 0) return null;
    const lines = joinDealMovementSections(sections(input));
    return {
        heading: `Движение сделок за ${dealMovementShortDate(input.day)}`,
        count: input.deals.filter(deal => deal.status !== 'moving').length,
        text: lines.join('\n').trim(),
        messages: splitDealMovementDigest(
            lines,
            DEAL_MOVEMENT_DIGEST.messageMax,
        ),
    };
}
