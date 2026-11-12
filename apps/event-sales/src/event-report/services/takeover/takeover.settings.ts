import {
    getSalesBaseStageOrder,
    PBX_DEAL_SALES_BASE_STAGES,
    PBX_DEAL_SALES_BASE_WON_ORDER,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { composeStageId } from '../deal/deal-target-stage.calculator';

/**
 * Настройки перехвата клиента отчётом (группа «Перехват клиента отчётом»).
 * Читает {@link EventReportSettingsResolver.takeoverSettings}.
 */
export interface ReportTakeoverSettings {
    /** Боты обзвона (`xo_start_bot_user_ids`): их работу забирают всегда. */
    botOwnerIds: number[];
    /** `report_takeover_force`: отчёт забирает работу ЛЮБОГО сотрудника. */
    force: boolean;
    /** `report_takeover_confirm`: перехват только после «Забрать себе». */
    confirm: boolean;
    /** `report_takeover_notify_previous`: уведомить прежнего ответственного. */
    notifyPrevious: boolean;
    /** `report_takeover_protect_from_stage`: сделки с этой стадии не трогать. */
    protectFromStage: PbxDealSalesBaseStageCode | null;
}

/** Настройки недоступны — ничего не перехватываем (правило 25.08). */
export const NO_REPORT_TAKEOVER: ReportTakeoverSettings = {
    botOwnerIds: [],
    force: false,
    confirm: true,
    notifyPrevious: true,
    protectFromStage: null,
};

/** Что решает перехват в ЭТОМ отчёте — вход init. */
export interface TakeoverDecisionOptions {
    botOwnerIds: readonly number[];
    /** Перехват всей работы действует (включён и подтверждён/без подтверждения). */
    force: boolean;
    protectFromStage: PbxDealSalesBaseStageCode | null;
}

export const NO_TAKEOVER_OPTIONS: TakeoverDecisionOptions = {
    botOwnerIds: [],
    force: false,
    protectFromStage: null,
};

/**
 * Перехват всей работы в этом отчёте: включён и — если на портале нужно
 * подтверждение — менеджер явно ответил «Забрать себе». Отчёт без ответа
 * (старый фронт, робот, «Недозвон» одной кнопкой) чужое не трогает.
 */
export const takeoverOptionsFor = (
    settings: ReportTakeoverSettings,
    confirmed: boolean | undefined,
): TakeoverDecisionOptions => ({
    botOwnerIds: settings.botOwnerIds,
    force: settings.force && (!settings.confirm || confirmed === true),
    protectFromStage: settings.protectFromStage,
});

/** Код стадии из настройки; мусор и пусто — null (защиты нет). */
export const parseProtectFromStage = (
    raw: unknown,
): PbxDealSalesBaseStageCode | null => {
    const code = typeof raw === 'string' ? raw.trim() : '';
    return (
        PBX_DEAL_SALES_BASE_STAGES.find(stage => stage.code === code)?.code ??
        null
    );
};

/**
 * Полные STAGE_ID основной воронки портала, на которых сделку коллеги
 * перехват не трогает: от стадии настройки до «Успеха» (не включая —
 * закрытые сделки и так не открыты). Нет настройки — пусто.
 */
export const protectedStageIds = (
    category: IPCategory | null | undefined,
    fromStage: PbxDealSalesBaseStageCode | null,
): Set<string> => {
    const result = new Set<string>();
    if (!category?.stages?.length || !fromStage) return result;
    const from = getSalesBaseStageOrder(fromStage);
    for (const stage of category.stages) {
        const known = PBX_DEAL_SALES_BASE_STAGES.find(
            item => item.code === stage.code,
        );
        if (!known) continue;
        if (
            known.order >= from &&
            known.order < PBX_DEAL_SALES_BASE_WON_ORDER
        ) {
            result.add(composeStageId(category.bitrixId, stage.bitrixId));
        }
    }
    return result;
};
