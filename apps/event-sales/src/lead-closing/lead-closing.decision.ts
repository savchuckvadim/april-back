import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { PbxLeadStageCode } from '@lib/portal-lib/pbx-domain/portal-lead/stages/const/pbx-lead-stages.const';

/**
 * Закрытие лида по итогу его работы (решения владельца 11.11 и 13.11.2026).
 *
 * Лид, ставший работой, висит открытым параллельно сделке («Взята в
 * работу», «Работа с компанией», старые статусы до переезда 16.09). Здесь
 * — ЧИСТОЕ правило: что станет с лидом по стадии его сделки-работы и по
 * тому, ведётся ли работа с клиентом где-то ещё.
 *
 * - сделка в работе, «Успех», «Отказ» → «Сконвертирован»: клиент
 *   настоящий, работа была (отказ — итог сделки, а не брак лида);
 * - «Не ЦА» → брак «Некачественный лид» (на garant — «100% Бесперспективный»);
 * - «Не состоялась»: есть живая «ОП Основная» клиента → «Сконвертирован» со
 *   связью на неё; работа идёт только в другой воронке → лид не трогаем;
 *   иначе → «Не состоялась» (на garant — «Клиент не идёт на контакт»);
 * - «Дубль» → «Сконвертирован», связь — на живую сделку клиента, если есть;
 * - сделка удалена → только при живой сделке клиента, иначе ручной разбор;
 * - «Не Беспокоить» и стадии, которых нет в нашей лестнице, — не трогаем.
 */

/** Статусы лида, в которые закрывает правило. */
export const LEAD_CLOSING_TARGETS = [
    'lead_converted',
    'lead_junk',
    'lead_apology',
] as const satisfies readonly PbxLeadStageCode[];
export type LeadClosingTarget = (typeof LEAD_CLOSING_TARGETS)[number];

/** Почему принято решение — для журнала и сводок. */
export const LEAD_CLOSING_REASONS = [
    'deal_open',
    'deal_won',
    'deal_fail',
    'deal_not_ca',
    'apology_live_deal',
    'apology_work_elsewhere',
    'apology_no_work',
    'duplicate_live_deal',
    'duplicate_no_live',
    'deleted_live_deal',
    'deleted_no_live',
    'not_call',
    'unknown_stage',
] as const;
export type LeadClosingReason = (typeof LEAD_CLOSING_REASONS)[number];

export interface LeadClosingInput {
    /** Сделка-работа лида; null — ссылка ведёт на удалённую сделку. */
    deal: { id: number; stage: PbxDealSalesBaseStageCode | null } | null;
    /** Самая свежая живая «ОП Основная» того же клиента (кроме самой сделки). */
    liveBaseDealId: number | null;
    /** У клиента есть открытая сделка в другой воронке. */
    hasOpenWorkElsewhere: boolean;
}

export interface LeadClosingDecision {
    /** Куда закрыть лид; null — лид не трогаем. */
    target: LeadClosingTarget | null;
    /** Сделка, у которой лид должен стоять в поле «Лид» (вкладка «Связи»). */
    linkDealId: number | null;
    reason: LeadClosingReason;
}

/**
 * Решения, при которых сделка связи — живая работа клиента: задачи лида без
 * сделки переносятся в неё. При остальных работа закончена — такие задачи
 * закрываются вместе с лидом (решение владельца 14.11.2026).
 */
const LIVE_LINK_REASONS: ReadonlySet<LeadClosingReason> = new Set([
    'deal_open',
    'deal_won',
    'apology_live_deal',
    'duplicate_live_deal',
    'deleted_live_deal',
]);

export const isLinkDealLive = (reason: LeadClosingReason): boolean =>
    LIVE_LINK_REASONS.has(reason);

const S = PBX_DEAL_SALES_BASE_STAGE_CODE;

/** Финальные стадии, кроме «Успеха»: у них свои правила. */
const CLOSED_STAGES: ReadonlySet<PbxDealSalesBaseStageCode> = new Set([
    S.fail,
    S.apology,
    S.notCa,
    S.notCall,
    S.duplicate,
]);

const decide = (
    target: LeadClosingTarget | null,
    linkDealId: number | null,
    reason: LeadClosingReason,
): LeadClosingDecision => ({ target, linkDealId, reason });

export function decideLeadClosing(
    input: LeadClosingInput,
): LeadClosingDecision {
    const { deal, liveBaseDealId: live } = input;
    if (!deal) {
        return live
            ? decide('lead_converted', live, 'deleted_live_deal')
            : decide(null, null, 'deleted_no_live');
    }
    const { id, stage } = deal;
    if (!stage) return decide(null, null, 'unknown_stage');
    if (stage === S.success) return decide('lead_converted', id, 'deal_won');
    if (!CLOSED_STAGES.has(stage)) {
        return decide('lead_converted', id, 'deal_open');
    }
    switch (stage) {
        case S.fail:
            return decide('lead_converted', id, 'deal_fail');
        case S.notCa:
            return decide('lead_junk', id, 'deal_not_ca');
        case S.apology:
            if (live) {
                return decide('lead_converted', live, 'apology_live_deal');
            }
            return input.hasOpenWorkElsewhere
                ? decide(null, null, 'apology_work_elsewhere')
                : decide('lead_apology', id, 'apology_no_work');
        case S.duplicate:
            return live
                ? decide('lead_converted', live, 'duplicate_live_deal')
                : decide('lead_converted', id, 'duplicate_no_live');
        default:
            return decide(null, null, 'not_call');
    }
}
