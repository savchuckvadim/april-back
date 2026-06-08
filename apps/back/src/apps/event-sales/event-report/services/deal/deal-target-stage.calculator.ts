import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { EventReportEventType } from '../../types/event-report.event-codes';

/**
 * Вычисление целевой стадии сделки для event-report.
 *
 * Pure-функции — никаких побочных эффектов, никакого Bitrix. Принимают
 * категорию портала (со списком стадий) + бизнес-флаги, возвращают
 * `stage.bitrixId` (строка вида `WARM`, `WON`, ...) или `null`, если
 * подходящая стадия не сконфигурирована.
 *
 * Алгоритмы переносим из legacy `shared/deal-flow/services/bitrix-deal.service.ts`
 * (`getSaleBaseTargetStage` / `getXOTargetStage` / `getTargetStagePresentation`
 * / `getTMCTargetStage`) — типизируем и покрываем тестами.
 */

export interface BaseStageInput {
    category: IPCategory;
    /** Код текущей стадии сделки в нашей нотации event-type (xo|warm|presentation|...) */
    currentStageEvent: EventReportEventType | null;
    planEventType: EventReportEventType | null;
    reportEventType: EventReportEventType | null;
    isResult: boolean;
    isUnplanned: boolean;
    isSuccess: boolean;
    isFail: boolean;
}

interface EventOrderEntry {
    code: EventReportEventType;
    order: number;
    stageSuffix: string;
}

/** Порядок событий по «лестнице» sales_base — нельзя понизить. */
const SALES_BASE_EVENT_ORDER: readonly EventOrderEntry[] = [
    { code: 'xo', order: 0, stageSuffix: 'cold' },
    { code: 'warm', order: 1, stageSuffix: 'warm' },
    { code: 'presentation', order: 2, stageSuffix: 'pres' },
    { code: 'document', order: 3, stageSuffix: 'offer_create' },
    { code: 'hot', order: 4, stageSuffix: 'in_progress' },
    { code: 'moneyAwait', order: 5, stageSuffix: 'money_await' },
    { code: 'supply', order: 6, stageSuffix: 'supply' },
];

/** Лестница событий TMC-воронки. */
const TMC_EVENT_ORDER: readonly EventOrderEntry[] = [
    { code: 'warm', order: 1, stageSuffix: 'plan' },
    { code: 'document', order: 3, stageSuffix: 'plan' },
    { code: 'hot', order: 4, stageSuffix: 'plan' },
    { code: 'moneyAwait', order: 6, stageSuffix: 'plan' },
    { code: 'presentation', order: 8, stageSuffix: 'pres_in_progress' },
];

/**
 * Целевая стадия для sales_base. Выбираем «максимум» по лестнице из
 * текущей-стадии / отчёта / плана; для unplanned добавляем presentation.
 * Финальные перебивают: success → win, fail → lose.
 */
export function getSalesBaseTargetStageCode(
    input: BaseStageInput,
): string | null {
    const { category, isSuccess, isFail, isResult, isUnplanned } = input;
    if (!category?.stages?.length) return null;

    const codes: EventReportEventType[] = [];
    if (input.planEventType) codes.push(input.planEventType);
    if (input.reportEventType) codes.push(input.reportEventType);
    if (input.currentStageEvent) codes.push(input.currentStageEvent);
    if (isUnplanned) codes.push('presentation');

    const matching = SALES_BASE_EVENT_ORDER.filter(e => codes.includes(e.code));
    const top = matching.reduce<EventOrderEntry | null>(
        (carry, item) =>
            carry === null || item.order > carry.order ? item : carry,
        null,
    );

    let suffix = top?.stageSuffix ?? 'plan';
    if (isSuccess) {
        suffix = 'success';
    } else if (isFail) {
        suffix = isResult ? 'fail' : 'noresult';
    }

    return resolveStageBitrixId(category, `sales_${suffix}`);
}

export interface XoStageInput {
    category: IPCategory;
    reportEventType: EventReportEventType | null;
    isExpired: boolean;
    isResult: boolean;
    isSuccess: boolean;
    isFail: boolean;
}

/** Целевая стадия sales_xo (cold pipeline). */
export function getXoTargetStageCode(input: XoStageInput): string | null {
    const {
        category,
        reportEventType,
        isExpired,
        isResult,
        isSuccess,
        isFail,
    } = input;
    if (!category?.stages?.length) return null;

    let suffix = '';
    if (reportEventType === 'xo') {
        if (isExpired) suffix = 'pending';
        if (isFail) suffix = isResult ? 'fail' : 'noresult';
        if ((isResult && !isFail) || isSuccess) suffix = 'success';
        if (!isResult && !isExpired) suffix = 'noresult';
    }
    if (!suffix) return null;
    return resolveStageBitrixId(category, `cold_${suffix}`);
}

export interface PresentationStageInput {
    category: IPCategory;
    /** plan | done | expired | fail | success */
    eventAction: 'plan' | 'done' | 'expired' | 'fail' | 'success' | 'noresult';
    isResult: boolean;
}

/** Целевая стадия sales_presentation (для конкретного действия). */
export function getPresentationTargetStageCode(
    input: PresentationStageInput,
): string | null {
    const { category, eventAction, isResult } = input;
    if (!category?.stages?.length) return null;
    let suffix: string = 'plan';
    switch (eventAction) {
        case 'done':
        case 'success':
            suffix = 'success';
            break;
        case 'expired':
            suffix = 'pending';
            break;
        case 'fail':
            suffix = isResult ? 'fail' : 'noresult';
            break;
        case 'noresult':
            suffix = 'noresult';
            break;
        case 'plan':
        default:
            suffix = 'plan';
            break;
    }
    return resolveStageBitrixId(category, `spres_${suffix}`);
}

export interface TmcStageInput {
    category: IPCategory;
    currentStageEvent: EventReportEventType | null;
    planEventType: EventReportEventType | null;
    reportEventType: EventReportEventType | null;
    isResult: boolean;
    isSuccess: boolean;
    isFail: boolean;
    isExpired: boolean;
}

/** Целевая стадия tmc_base. */
export function getTmcTargetStageCode(input: TmcStageInput): string | null {
    const {
        category,
        currentStageEvent,
        planEventType,
        reportEventType,
        isResult,
        isSuccess,
        isFail,
        isExpired,
    } = input;
    if (!category?.stages?.length) return null;

    const orderEntries: EventOrderEntry[] = [...TMC_EVENT_ORDER];
    orderEntries.push({
        code: 'xo' as EventReportEventType, // используем 'xo' как маркер «pending»
        order: isExpired ? 7 : 0,
        stageSuffix: 'pending',
    });

    const codes: EventReportEventType[] = [];
    if (planEventType) codes.push(planEventType);
    if (reportEventType) codes.push(reportEventType);
    if (currentStageEvent) codes.push(currentStageEvent);
    if (isExpired) codes.push('xo'); // переиспользуем как pending marker

    const matching = orderEntries.filter(e => codes.includes(e.code));
    const top = matching.reduce<EventOrderEntry | null>(
        (carry, item) =>
            carry === null || item.order > carry.order ? item : carry,
        null,
    );

    let suffix = top?.stageSuffix ?? 'plan';
    if (isFail) suffix = isResult ? 'fail' : 'noresult';
    if (isSuccess) suffix = 'success';

    return resolveStageBitrixId(category, `sales_tmc_${suffix}`);
}

/**
 * Извлекает bitrixId стадии по её коду в категории.
 * Возвращает `null`, если стадии нет (некорректная конфигурация портала).
 */
function resolveStageBitrixId(
    category: IPCategory,
    fullStageCode: string,
): string | null {
    const stage = category.stages.find(s => s.code === fullStageCode);
    return stage?.bitrixId ?? null;
}

/**
 * Удобный helper для use-case: складывает STAGE_ID из категории и кода
 * (`C{categoryId}:{stageBitrixId}`), как ожидает Bitrix CRM API.
 */
export function composeStageId(
    categoryBitrixId: number | string,
    stageBitrixId: string,
): string {
    return `C${categoryBitrixId}:${stageBitrixId}`;
}

/**
 * Определяет event-код по STAGE_ID текущей сделки (нужно для проверки
 * «нельзя понизить» в sales_base / tmc). Возвращает `null`, если стадия
 * не сопоставляется ни одному event-event-type.
 */
export function detectEventFromBaseStage(
    category: IPCategory,
    stageId: string | null | undefined,
): EventReportEventType | null {
    return detectEventByOrder(
        category,
        stageId,
        SALES_BASE_EVENT_ORDER,
        'sales',
    );
}

export function detectEventFromTmcStage(
    category: IPCategory,
    stageId: string | null | undefined,
): EventReportEventType | null {
    return detectEventByOrder(category, stageId, TMC_EVENT_ORDER, 'sales_tmc');
}

function detectEventByOrder(
    category: IPCategory,
    stageId: string | null | undefined,
    order: readonly EventOrderEntry[],
    prefix: 'sales' | 'sales_tmc',
): EventReportEventType | null {
    if (!stageId || !category?.stages?.length) return null;
    for (const stage of category.stages) {
        const full = `C${category.bitrixId}:${stage.bitrixId}`;
        if (full !== stageId) continue;
        for (const entry of order) {
            if (stage.code === `${prefix}_${entry.stageSuffix}`) {
                return entry.code;
            }
        }
    }
    return null;
}
