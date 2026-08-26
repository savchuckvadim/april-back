import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    PBX_DEAL_SALES_BASE_STAGE_PREFIX,
    PbxDealSalesBaseStageSuffix,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { PbxDealSalesXoCategoryType } from '@lib/portal-lib/pbx-domain/portal-deal/sales/xo/type/pbx-deal-sales-xo.type';
import { PbxDealSalesPresentationCategoryType } from '@lib/portal-lib/pbx-domain/portal-deal/sales/presentation/type/pbx-deal-sales-presentation.type';
import { PbxDealSalesTmcCategoryType } from '@lib/portal-lib/pbx-domain/portal-deal/sales/tmc/type/pbx-deal-sales-tmc.type';
import {
    COLD_EVENT_TYPES,
    EVENT_REPORT_ACTION,
    EVENT_REPORT_EVENT_TYPE,
    EventReportAction,
    EventReportEventType,
    isColdEventType,
} from '../../types/event-report.event-codes';

/**
 * Вычисление целевой стадии сделки для event-report.
 *
 * Pure-функции — никаких побочных эффектов, никакого Bitrix. Принимают
 * категорию портала (со списком стадий) + бизнес-флаги, возвращают
 * `stage.bitrixId` (строка вида `WARM`, `WON`, ...) или `null`, если
 * подходящая стадия не сконфигурирована.
 *
 * Коды стадий НЕ пишутся литералами (ai/rules/pbx-typing.md): суффиксы
 * выводятся из шаблонных типов воронок, поэтому склейка `префикс+суффикс`
 * не может дать код несуществующей стадии — компилятор поймает опечатку.
 */

/** Суффикс кода стадии: `cold_pending` при префиксе `cold_` → `pending`. */
type StageSuffixOf<
    TCode extends string,
    TPrefix extends string,
> = TCode extends `${TPrefix}${infer Suffix}` ? Suffix : never;

const XO_STAGE_PREFIX = 'cold_' as const;
const PRESENTATION_STAGE_PREFIX = 'spres_' as const;
const TMC_STAGE_PREFIX = 'sales_tmc_' as const;

type XoStageSuffix = StageSuffixOf<
    PbxDealSalesXoCategoryType['stages'][number]['code'],
    typeof XO_STAGE_PREFIX
>;
type PresentationStageSuffix = StageSuffixOf<
    PbxDealSalesPresentationCategoryType['stages'][number]['code'],
    typeof PRESENTATION_STAGE_PREFIX
>;
type TmcStageSuffix = StageSuffixOf<
    PbxDealSalesTmcCategoryType['stages'][number]['code'],
    typeof TMC_STAGE_PREFIX
>;

/** Суффиксы стадий «ОП Основная» (sales_base). */
const SALES_BASE_STAGE_SUFFIX = {
    cold: 'cold',
    warm: 'warm',
    presentation: 'pres',
    refine: 'refine',
    document: 'offer_create',
    hot: 'in_progress',
    moneyAwait: 'money_await',
    supply: 'supply',
    success: 'success',
    fail: 'fail',
    /** «Не состоялась» (APOLOGY) — отказ по нерезультативному отчёту. */
    apology: 'double',
    /** «Не ЦА» (NOT_CA) — клиент нецелевой. */
    notCa: 'not_ca',
} as const satisfies Record<string, PbxDealSalesBaseStageSuffix>;

/** Суффиксы стадий воронки ХО (sales_xo). */
const XO_STAGE_SUFFIX = {
    pending: 'pending',
    success: 'success',
    fail: 'fail',
    noresult: 'noresult',
} as const satisfies Record<string, XoStageSuffix>;

/** Суффиксы стадий воронки презентаций (sales_presentation). */
const PRESENTATION_STAGE_SUFFIX = {
    plan: 'plan',
    pending: 'pending',
    success: 'success',
    fail: 'fail',
    noresult: 'noresult',
} as const satisfies Record<string, PresentationStageSuffix>;

/** Суффиксы стадий воронки ТМЦ (tmc_base). */
const TMC_STAGE_SUFFIX = {
    plan: 'plan',
    pending: 'pending',
    presInProgress: 'pres_in_progress',
    success: 'success',
    fail: 'fail',
    noresult: 'noresult',
} as const satisfies Record<string, TmcStageSuffix>;

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
    /** Отчёт «не очень»: разговор состоялся, но результата нет. */
    isNoResult: boolean;
    /** Клиент нецелевой — отказ уводит сделку в отдельный финал «Не ЦА». */
    isNotCa: boolean;
}

interface EventOrderEntry<TSuffix extends string> {
    code: EventReportEventType;
    order: number;
    stageSuffix: TSuffix;
}

/**
 * Порядок событий по «лестнице» sales_base — нельзя понизить.
 *
 * Три холодных типа (`xo`/`xoRequest`/`xoLead`) стоят на одной ступени: по
 * разговору они разные, по воронке — одна и та же «Холодная» стадия.
 *
 * Порядок обязан повторять PBX_DEAL_SALES_BASE_STAGES: «Доработка» стоит
 * МЕЖДУ презентацией и документами (клиента дорабатывают — узнают компанию
 * и ИНН — и только потом готовят документы).
 */
const SALES_BASE_EVENT_ORDER: readonly EventOrderEntry<PbxDealSalesBaseStageSuffix>[] =
    [
        {
            code: EVENT_REPORT_EVENT_TYPE.xo,
            order: 0,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.cold,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.xoRequest,
            order: 0,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.cold,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.xoLead,
            order: 0,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.cold,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.warm,
            order: 1,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.warm,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.presentation,
            order: 2,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.presentation,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.refine,
            order: 3,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.refine,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.document,
            order: 4,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.document,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.hot,
            order: 5,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.hot,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.moneyAwait,
            order: 6,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.moneyAwait,
        },
        {
            code: EVENT_REPORT_EVENT_TYPE.supply,
            order: 7,
            stageSuffix: SALES_BASE_STAGE_SUFFIX.supply,
        },
    ];

/** Лестница событий TMC-воронки. */
const TMC_EVENT_ORDER: readonly EventOrderEntry<TmcStageSuffix>[] = [
    {
        code: EVENT_REPORT_EVENT_TYPE.warm,
        order: 1,
        stageSuffix: TMC_STAGE_SUFFIX.plan,
    },
    {
        code: EVENT_REPORT_EVENT_TYPE.document,
        order: 3,
        stageSuffix: TMC_STAGE_SUFFIX.plan,
    },
    {
        code: EVENT_REPORT_EVENT_TYPE.hot,
        order: 4,
        stageSuffix: TMC_STAGE_SUFFIX.plan,
    },
    {
        code: EVENT_REPORT_EVENT_TYPE.moneyAwait,
        order: 6,
        stageSuffix: TMC_STAGE_SUFFIX.plan,
    },
    {
        code: EVENT_REPORT_EVENT_TYPE.presentation,
        order: 8,
        stageSuffix: TMC_STAGE_SUFFIX.presInProgress,
    },
];

/** Ступень «в ожидании» для холодных кодов в TMC-воронке. */
const TMC_COLD_EXPIRED_ORDER = 7;

/**
 * Целевая стадия для sales_base. Выбираем «максимум» по лестнице из
 * текущей-стадии / отчёта / плана; для unplanned добавляем presentation.
 * Финальные перебивают: success → «Успех», fail → отказной финал.
 */
export function getSalesBaseTargetStageCode(
    input: BaseStageInput,
): string | null {
    const { category, isSuccess, isFail, isUnplanned } = input;
    if (!category?.stages?.length) return null;

    const codes: EventReportEventType[] = [];
    if (input.planEventType) codes.push(input.planEventType);
    if (input.reportEventType) codes.push(input.reportEventType);
    if (input.currentStageEvent) codes.push(input.currentStageEvent);
    if (isUnplanned) codes.push(EVENT_REPORT_EVENT_TYPE.presentation);

    const matching = SALES_BASE_EVENT_ORDER.filter(e => codes.includes(e.code));
    const top =
        matching.reduce<EventOrderEntry<PbxDealSalesBaseStageSuffix> | null>(
            (carry, item) =>
                carry === null || item.order > carry.order ? item : carry,
            null,
        );

    let suffix: PbxDealSalesBaseStageSuffix | null = top?.stageSuffix ?? null;
    if (isSuccess) {
        suffix = SALES_BASE_STAGE_SUFFIX.success;
    } else if (isFail) {
        suffix = resolveFailSuffix(input);
    }

    // Ни лестница, ни финальный статус стадию не дали — двигать сделку некуда.
    if (!suffix) return null;

    return resolveStageBitrixId(
        category,
        `${PBX_DEAL_SALES_BASE_STAGE_PREFIX}${suffix}`,
    );
}

/**
 * Отказной финал воронки ОП: три разных исхода вместо одного «Отказа».
 *
 * Отказ закрывает сделку ВСЕГДА, даже когда отчёт нерезультативный («не
 * очень» + отказ — обычный финал недозвонной цепочки). Раньше для такого
 * отчёта подставлялся суффикс `noresult`, стадии с таким кодом в воронке ОП
 * нет, код не резолвился — менеджер отправлял отказ, а сделка оставалась
 * открытой. Теперь у каждого исхода своя стадия:
 *  - нецелевой клиент → «Не ЦА» (перебивает всё: причина отказа известна);
 *  - разговор без результата → «Не состоялась» (APOLOGY);
 *  - обычный отказ по результату разговора → «Отказ» (LOSE).
 */
function resolveFailSuffix(input: BaseStageInput): PbxDealSalesBaseStageSuffix {
    if (input.isNotCa) return SALES_BASE_STAGE_SUFFIX.notCa;
    if (input.isNoResult) return SALES_BASE_STAGE_SUFFIX.apology;
    return SALES_BASE_STAGE_SUFFIX.fail;
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

    let suffix: XoStageSuffix | null = null;
    // Воронка ХО обслуживает всю холодную работу: настоящий обзвон, заявку
    // с сайта и входящий лид. Раньше сравнение шло с литералом 'xo', и
    // отчёт по заявке ХО-сделку бы не двинул.
    if (isColdEventType(reportEventType)) {
        if (isExpired) suffix = XO_STAGE_SUFFIX.pending;
        if (isFail) {
            suffix = isResult ? XO_STAGE_SUFFIX.fail : XO_STAGE_SUFFIX.noresult;
        }
        if ((isResult && !isFail) || isSuccess)
            suffix = XO_STAGE_SUFFIX.success;
        if (!isResult && !isExpired) suffix = XO_STAGE_SUFFIX.noresult;
    }
    if (!suffix) return null;
    return resolveStageBitrixId(category, `${XO_STAGE_PREFIX}${suffix}`);
}

/** Действия, по которым двигается сделка воронки презентаций. */
export const PRESENTATION_EVENT_ACTIONS = [
    EVENT_REPORT_ACTION.plan,
    EVENT_REPORT_ACTION.done,
    EVENT_REPORT_ACTION.expired, //переводится как просрочен но на самом деле имеется ввиду что менеджер переносить событие
    EVENT_REPORT_ACTION.fail,
    EVENT_REPORT_ACTION.success,
    EVENT_REPORT_ACTION.noresult,
] as const satisfies readonly EventReportAction[];

export type PresentationEventAction =
    (typeof PRESENTATION_EVENT_ACTIONS)[number];

export interface PresentationStageInput {
    category: IPCategory;
    eventAction: PresentationEventAction;
    isResult: boolean;
}

/** Целевая стадия sales_presentation (для конкретного действия). */
export function getPresentationTargetStageCode(
    input: PresentationStageInput,
): string | null {
    const { category, eventAction, isResult } = input;
    if (!category?.stages?.length) return null;
    let suffix: PresentationStageSuffix = PRESENTATION_STAGE_SUFFIX.plan;
    switch (eventAction) {
        case EVENT_REPORT_ACTION.done:
        case EVENT_REPORT_ACTION.success:
            suffix = PRESENTATION_STAGE_SUFFIX.success;
            break;
        case EVENT_REPORT_ACTION.expired:
            suffix = PRESENTATION_STAGE_SUFFIX.pending;
            break;
        case EVENT_REPORT_ACTION.fail:
            suffix = isResult
                ? PRESENTATION_STAGE_SUFFIX.fail
                : PRESENTATION_STAGE_SUFFIX.noresult;
            break;
        case EVENT_REPORT_ACTION.noresult:
            suffix = PRESENTATION_STAGE_SUFFIX.noresult;
            break;
        case EVENT_REPORT_ACTION.plan:
        default:
            suffix = PRESENTATION_STAGE_SUFFIX.plan;
            break;
    }
    return resolveStageBitrixId(
        category,
        `${PRESENTATION_STAGE_PREFIX}${suffix}`,
    );
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

    const orderEntries: EventOrderEntry<TmcStageSuffix>[] = [
        ...TMC_EVENT_ORDER,
    ];
    // Холодные коды в TMC-воронке работают маркером «pending» (своей ступени
    // у них тут нет). Заявки ведут себя так же, как ХО, — иначе отчёт по
    // заявке из ТМЦ терял бы стадию «в ожидании».
    for (const cold of COLD_EVENT_TYPES) {
        orderEntries.push({
            code: cold,
            order: isExpired ? TMC_COLD_EXPIRED_ORDER : 0,
            stageSuffix: TMC_STAGE_SUFFIX.pending,
        });
    }

    const codes: EventReportEventType[] = [];
    if (planEventType) codes.push(planEventType);
    if (reportEventType) codes.push(reportEventType);
    if (currentStageEvent) codes.push(currentStageEvent);
    // Переиспользуем холодный код как маркер «в ожидании».
    if (isExpired) codes.push(EVENT_REPORT_EVENT_TYPE.xo);

    const matching = orderEntries.filter(e => codes.includes(e.code));
    const top = matching.reduce<EventOrderEntry<TmcStageSuffix> | null>(
        (carry, item) =>
            carry === null || item.order > carry.order ? item : carry,
        null,
    );

    let suffix: TmcStageSuffix = top?.stageSuffix ?? TMC_STAGE_SUFFIX.plan;
    if (isFail) {
        suffix = isResult ? TMC_STAGE_SUFFIX.fail : TMC_STAGE_SUFFIX.noresult;
    }
    if (isSuccess) suffix = TMC_STAGE_SUFFIX.success;

    return resolveStageBitrixId(category, `${TMC_STAGE_PREFIX}${suffix}`);
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
        PBX_DEAL_SALES_BASE_STAGE_PREFIX,
    );
}

export function detectEventFromTmcStage(
    category: IPCategory,
    stageId: string | null | undefined,
): EventReportEventType | null {
    return detectEventByOrder(
        category,
        stageId,
        TMC_EVENT_ORDER,
        TMC_STAGE_PREFIX,
    );
}

function detectEventByOrder<TSuffix extends string>(
    category: IPCategory,
    stageId: string | null | undefined,
    order: readonly EventOrderEntry<TSuffix>[],
    prefix: string,
): EventReportEventType | null {
    if (!stageId || !category?.stages?.length) return null;
    for (const stage of category.stages) {
        const full = composeStageId(category.bitrixId, stage.bitrixId);
        if (full !== stageId) continue;
        for (const entry of order) {
            if (stage.code === `${prefix}${entry.stageSuffix}`) {
                return entry.code;
            }
        }
    }
    return null;
}
