import { bbBold } from '@lib/rop-reports';
import {
    DEAL_MOVEMENT_STATUS_TITLES,
    dealMovementDaysText,
    dealMovementLimitText,
    dealMovementShortDate,
    type DealMovementStatus,
} from '@lib/sales-ai-analytics';
import type { DealAuditDigest } from '../../deal-audit/services/deal-audit-digest-delivery';
import { DEAL_MOVEMENT_DIGEST } from '../constants/deal-movement.const';
import type { DealMovementDigestDeal } from '../types/deal-movement.types';
import {
    DEAL_MOVEMENT_DIGEST_TEXTS,
    dealMovementAuditCountLine,
    dealMovementCountsLine,
    dealMovementCountsText,
    dealMovementListSection,
    joinDealMovementSections,
    splitDealMovementDigest,
    type DealMovementDigestScope,
} from './deal-movement-digest.blocks';
import {
    changedSince,
    topDealMovementDigestDeals,
} from './deal-movement-digest-deals';

/**
 * Сводка «Движение сделок» за период — раз в неделю или раз в две недели
 * (решение владельца 20.11.2026): что изменилось с прошлой сводки,
 * крупнейшие проблемные, «Без внимания» отдельным блоком и «Давно без
 * продвижения» — напоминания по ступеням (вдвое, втрое… дольше срока,
 * каждая ступень один раз; в ежедневную сводку и в ленту они не идут).
 * Чистая вёрстка в BB-коде, по-русски, без кодов.
 */

/** Проблемные статусы блока «Крупнейшие проблемные» («Без внимания» — отдельно). */
const PROBLEM_STATUSES: readonly DealMovementStatus[] = [
    'rolled_back',
    'stuck',
    'at_risk',
];

/** Порядок «стали с прошлой сводки». */
const BECAME_ORDER: readonly DealMovementStatus[] = [
    'stuck',
    'abandoned',
    'rolled_back',
    'at_risk',
];

export const DEAL_MOVEMENT_PERIOD_DIGEST_TEXTS = {
    noBecame: 'С прошлой сводки новых проблемных сделок нет.',
    became: 'С прошлой сводки стали',
} as const;

export interface DealMovementPeriodDigestInput extends DealMovementDigestScope {
    /** День портала 'YYYY-MM-DD' — конец периода. */
    readonly day: string;
    /** Длина периода режима: 7 или 14 дней. */
    readonly periodDays: number;
    /** Момент прошлой сводки (или начала периода), мс. */
    readonly sinceMs: number;
    /** День портала начала периода 'YYYY-MM-DD'. */
    readonly fromDay: string;
    /** Сколько сделок в каждом списке. */
    readonly top: number;
}

/** «Давно без продвижения»: сделки с ушедшей ступенью, по сумме. */
export const reminderDealMovementDigestDeals = (
    deals: readonly DealMovementDigestDeal[],
    top: number,
): DealMovementDigestDeal[] =>
    topDealMovementDigestDeals(deals, top, deal => deal.remindStep !== null);

/** «в стадии 63 дня при обычных 21 дне для этой стадии — больше чем вдвое». */
export const dealMovementReminderText = (
    deal: DealMovementDigestDeal,
): string =>
    `в стадии ${dealMovementDaysText(deal.daysInStage)} ${dealMovementLimitText(deal.limit)}` +
    (deal.remindStep === null
        ? ''
        : ` — дольше срока больше чем в ${deal.remindStep} раза`);

const periodTitle = (input: DealMovementPeriodDigestInput): string => {
    const span = input.periodDays > 7 ? 'две недели' : 'неделю';
    return (
        `Движение сделок за ${span} ` +
        `(с ${dealMovementShortDate(input.fromDay)} по ${dealMovementShortDate(input.day)})`
    );
};

/** «С прошлой сводки стали: Без продвижения — 3 · …». */
function becameLine(input: DealMovementPeriodDigestInput): string {
    const changed = input.deals.filter(deal =>
        changedSince(deal, input.sinceMs),
    );
    if (changed.length === 0) return DEAL_MOVEMENT_PERIOD_DIGEST_TEXTS.noBecame;
    return `${DEAL_MOVEMENT_PERIOD_DIGEST_TEXTS.became}: ${dealMovementCountsText(
        status => changed.filter(deal => deal.status === status).length,
        BECAME_ORDER,
    )}`;
}

function sections(input: DealMovementPeriodDigestInput): string[][] {
    const auditCount = dealMovementAuditCountLine(input.deals);
    const head = [
        bbBold(periodTitle(input)),
        dealMovementCountsLine(input.deals),
        ...(auditCount === null ? [] : [auditCount]),
        becameLine(input),
    ];
    const problems = topDealMovementDigestDeals(input.deals, input.top, deal =>
        PROBLEM_STATUSES.includes(deal.status),
    );
    const abandoned = topDealMovementDigestDeals(
        input.deals,
        input.top,
        deal => deal.status === 'abandoned',
    );
    const reminders = reminderDealMovementDigestDeals(input.deals, input.top);
    return [
        head,
        dealMovementListSection(
            input,
            bbBold(
                `Крупнейшие проблемные — первые ${problems.length} по сумме`,
            ),
            problems,
            deal =>
                `${DEAL_MOVEMENT_STATUS_TITLES[deal.status]}: ${deal.reasons}`,
        ),
        dealMovementListSection(
            input,
            bbBold(
                `${DEAL_MOVEMENT_STATUS_TITLES.abandoned} — первые ${abandoned.length} по сумме`,
            ),
            abandoned,
        ),
        dealMovementListSection(
            input,
            bbBold(
                `Давно без продвижения — первые ${reminders.length} по сумме`,
            ),
            reminders,
            dealMovementReminderText,
        ),
        [`[i]${DEAL_MOVEMENT_DIGEST_TEXTS.closing}[/i]`],
    ];
}

/**
 * Сводка за период одного получателя: текст целиком и серия сообщений не
 * длиннее предела. Сделок нет — null.
 */
export function buildDealMovementPeriodDigest(
    input: DealMovementPeriodDigestInput,
): DealAuditDigest | null {
    if (input.deals.length === 0) return null;
    const lines = joinDealMovementSections(sections(input));
    return {
        heading: periodTitle(input),
        count: input.deals.filter(deal => deal.status !== 'moving').length,
        text: lines.join('\n').trim(),
        messages: splitDealMovementDigest(
            lines,
            DEAL_MOVEMENT_DIGEST.messageMax,
        ),
    };
}
