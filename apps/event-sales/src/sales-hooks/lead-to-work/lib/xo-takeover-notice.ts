import {
    getSalesBaseStageOrder,
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PBX_DEAL_SALES_BASE_STAGES,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

/**
 * Перехват клиента холодным обзвоном: кому и что сообщать.
 *
 * Зачем: при `isXo=Y` сделка переходит новому ответственному, а стадия
 * сбрасывается в «Холодные» (решение владельца 13.09.2026 — холодный старт
 * обнуляет прежнюю работу). Прежний ответственный узнавал об этом из
 * сообщения «заявка передана другому сотруднику», где про сделку, клиента
 * и сброс стадии не было ни слова — 27.10.2026 это и привело к вопросу
 * клиента «сотрудники друг другу работу не передавали, откуда третий».
 *
 * Правило владельца 27.10.2026: писать прежнему только когда ЕСТЬ ЧТО
 * ТЕРЯТЬ. Перехват на «Новой» и «Холодных» — обычный ход (заявка лежит,
 * обзвон её забирает) и идёт потоком, такие сообщения были бы шумом.
 */

/**
 * Стадия, с которой перехват считается потерей работы: «Переговоры».
 * Ниже (Новая, Холодные) — ожидаемый ход, прежнему не пишем.
 */
export const XO_TAKEOVER_NOTICE_MIN_STAGE: PbxDealSalesBaseStageCode =
    PBX_DEAL_SALES_BASE_STAGE_CODE.warm;

/** Что было у прежнего ответственного до перехвата. */
export interface IXoTakeoverState {
    /** Сделка, которую забирает холодный обзвон; null — сделки не было. */
    dealId: number | null;
    /** Код стадии сделки ДО перехвата; null — стадию определить не удалось. */
    stageCode: PbxDealSalesBaseStageCode | null;
    /** Название клиента (компания, иначе заявка) — в текст сообщения. */
    clientTitle: string | null;
}

/**
 * Терял ли прежний ответственный работу: сделка существовала и стояла
 * на «Переговорах» или выше.
 *
 * Стадию определить не удалось → считаем, что терял: лучше лишнее
 * сообщение, чем молчание о перехвате реальных переговоров.
 */
export function isXoTakeoverWorthNotice(state: IXoTakeoverState): boolean {
    if (!state.dealId) return false;
    if (!state.stageCode) return true;
    return (
        getSalesBaseStageOrder(state.stageCode) >=
        getSalesBaseStageOrder(XO_TAKEOVER_NOTICE_MIN_STAGE)
    );
}

/** Стадия воронки, как её отдаёт runtime портала. */
interface IStageRow {
    code: string;
    bitrixId: string;
    name?: string;
}

/** Код и название стадии воронки ОП по её STAGE_ID (`C31:WARM`). */
export function findSalesBaseStage(
    stages: readonly IStageRow[],
    stageId: string | null,
): { code: PbxDealSalesBaseStageCode; name: string | null } | null {
    if (!stageId) return null;
    // STAGE_ID = `C{category}:{bitrixId}`; у стадии хранится только bitrixId.
    const bitrixId = stageId.includes(':')
        ? stageId.slice(stageId.indexOf(':') + 1)
        : stageId;
    const stage = stages.find(item => item.bitrixId === bitrixId);
    if (!stage) return null;
    const known = PBX_DEAL_SALES_BASE_STAGES.find(
        item => item.code === stage.code,
    );
    return known ? { code: known.code, name: stage.name ?? null } : null;
}
