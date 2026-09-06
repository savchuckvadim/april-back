import { PbxSalesKpiListFieldItemCode } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { CallReportCallTypeCode } from './pbx-aicall-smart.type';

/**
 * Карта трёх алфавитов AI-аналитики ОП (план
 * ai/tasks/ai-sales-analytics-plan.md, §2.1): AI-тип звонка (классификатор
 * разбора, CALL_REPORT_CALL_TYPE_CODES) ↔ item'ы `event_type` KPI-списка
 * sales_kpi (самоотчёт менеджера) ↔ стадии основной воронки sales_base
 * (приор call-type-prior.util.ts в event-sales).
 *
 * Единственный источник правды для витрины: подписи подвкладок, per-type
 * факты KPI, тон UI и корзина оценок выводятся отсюда. Согласованность с
 * приором и полнота по обоим алфавитам сторожится тестом
 * apps/event-sales/src/call-report/__tests__/ai-analytics-event-map.spec.ts.
 *
 * Стадии — только основная воронка: в её лестнице (PBX_DEAL_SALES_BASE_STAGES)
 * коды типизированы, а сделка-исход (`baseDealId`) живёт именно там.
 */

/** Тоны UI (реестр `lib/tones.ts` пакета april-ui во фронте kpi-sales). */
export const AI_ANALYTICS_TONES = [
    'event-cold',
    'info',
    'event-pres',
    'event-refine',
    'event-hot',
    'event-money',
    'neutral',
] as const;
export type AiAnalyticsTone = (typeof AI_ANALYTICS_TONES)[number];

/**
 * Корзины оценок за период (§2.2): при малом n по типу оценки объединяются
 * в контакт / презентацию / закрытие; по типам остаются n и чек-листы.
 */
export const AI_ANALYTICS_BUCKETS = [
    'contact',
    'presentation',
    'closing',
] as const;
export type AiAnalyticsBucket = (typeof AI_ANALYTICS_BUCKETS)[number];

/** Код item'а `event_type` KPI-списка sales_kpi. */
export type AiAnalyticsKpiEventTypeCode =
    PbxSalesKpiListFieldItemCode<'event_type'>;

/** Описание одного AI-типа звонка в карте. */
export interface AiAnalyticsEventKind {
    /** Подпись подвкладки/столбца в UI. */
    readonly title: string;
    /** KPI-коды `event_type`, по которым считается факт `done` этого типа. */
    readonly kpiEventTypeCodes: readonly AiAnalyticsKpiEventTypeCode[];
    /** Главный KPI-код для заголовочной цифры (null — типу нечего считать). */
    readonly kpiPrimaryEventTypeCode: AiAnalyticsKpiEventTypeCode | null;
    /** Почему у типа нет KPI-факта — уезжает в `kpi[].reason` DTO. */
    readonly kpiReason: string | null;
    /**
     * Стадии sales_base, с которых приор (resolveCallTypePrior) ожидает
     * этот тип звонка. Пусто — тип не привязан к стадии сделки.
     */
    readonly stagePriorCodes: readonly PbxDealSalesBaseStageCode[];
    readonly tone: AiAnalyticsTone;
    /** null — тип не участвует в оценках (доля уходит в `meta`). */
    readonly bucket: AiAnalyticsBucket | null;
}

export const AI_ANALYTICS_EVENT_KINDS = {
    cold: {
        title: 'Холодный выход на ЛПР',
        kpiEventTypeCodes: ['xo'],
        kpiPrimaryEventTypeCode: 'xo',
        kpiReason: null,
        stagePriorCodes: [PBX_DEAL_SALES_BASE_STAGE_CODE.cold],
        tone: 'event-cold',
        bucket: 'contact',
    },
    // Заявка с сайта — тёплый вход со своим регламентом: KPI-событие `site`
    // принадлежит ему, а не «Звонку», иначе факт по заявкам считался бы
    // дважды. Приор — по лиду-заявке (leadWorkKind = request), стадий нет.
    site_lead: {
        title: 'Заявка с сайта',
        kpiEventTypeCodes: ['site'],
        kpiPrimaryEventTypeCode: 'site',
        kpiReason: null,
        stagePriorCodes: [],
        tone: 'info',
        bucket: 'contact',
    },
    call: {
        title: 'Звонок',
        kpiEventTypeCodes: ['call', 'come_call'],
        kpiPrimaryEventTypeCode: 'call',
        kpiReason: null,
        stagePriorCodes: [
            PBX_DEAL_SALES_BASE_STAGE_CODE.new,
            PBX_DEAL_SALES_BASE_STAGE_CODE.warm,
        ],
        tone: 'info',
        bucket: 'contact',
    },
    // Три среза презентаций складывать нельзя (баг 21.07: 130 вместо 65) —
    // канон один: presentation_uniq.
    presentation: {
        title: 'Презентация',
        kpiEventTypeCodes: [
            'presentation',
            'presentation_uniq',
            'presentation_contact_uniq',
        ],
        kpiPrimaryEventTypeCode: 'presentation_uniq',
        kpiReason: null,
        stagePriorCodes: [PBX_DEAL_SALES_BASE_STAGE_CODE.presentation],
        tone: 'event-pres',
        bucket: 'presentation',
    },
    // В сводный KPI-список доработка пишется как `call` (маппинг
    // refine→call в event-report), свой item `refine` есть только в
    // истории — факта по типу нет, и DTO объясняет это причиной.
    refine: {
        title: 'Доработка',
        kpiEventTypeCodes: [],
        kpiPrimaryEventTypeCode: null,
        kpiReason: 'refine-mapped-to-call',
        stagePriorCodes: [PBX_DEAL_SALES_BASE_STAGE_CODE.refine],
        tone: 'event-refine',
        bucket: 'closing',
    },
    // Документные события (ev_offer*, ev_invoice*) в items `event_type`
    // sales_kpi не заведены — до их установки факт решения считается по
    // звонкам по решению.
    decision: {
        title: 'В решении',
        kpiEventTypeCodes: ['call_in_progress'],
        kpiPrimaryEventTypeCode: 'call_in_progress',
        kpiReason: null,
        stagePriorCodes: [
            PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate,
            PBX_DEAL_SALES_BASE_STAGE_CODE.documentSend,
        ],
        tone: 'event-hot',
        bucket: 'closing',
    },
    payment: {
        title: 'Оплата',
        kpiEventTypeCodes: ['call_in_money', 'ev_success'],
        kpiPrimaryEventTypeCode: 'call_in_money',
        kpiReason: null,
        stagePriorCodes: [
            PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress,
            PBX_DEAL_SALES_BASE_STAGE_CODE.moneyAwait,
            PBX_DEAL_SALES_BASE_STAGE_CODE.supply,
        ],
        tone: 'event-money',
        bucket: 'closing',
    },
    other: {
        title: 'Другое',
        kpiEventTypeCodes: [],
        kpiPrimaryEventTypeCode: null,
        kpiReason: 'other-share-in-meta',
        stagePriorCodes: [],
        tone: 'neutral',
        bucket: null,
    },
    irrelevant: {
        title: 'Нерелевантный',
        kpiEventTypeCodes: [],
        kpiPrimaryEventTypeCode: null,
        kpiReason: 'irrelevant-share-in-meta',
        stagePriorCodes: [],
        tone: 'neutral',
        bucket: null,
    },
} as const satisfies Record<CallReportCallTypeCode, AiAnalyticsEventKind>;

export type AiAnalyticsEventKindsMap = typeof AI_ANALYTICS_EVENT_KINDS;

/**
 * Item'ы `event_type`, НАМЕРЕННО не привязанные ни к одному AI-типу — с
 * причиной. Вместе с картой покрывают справочник целиком: новый item без
 * решения «чей он» роняет тест согласованности, а не молча теряется.
 */
export const AI_ANALYTICS_UNMAPPED_KPI_EVENT_TYPES = {
    info: 'информационное событие — не звонок этапа',
    seminar: 'приглашение на семинар — не звонок этапа',
    ev_fail: 'исход «Отказ» — сверка сделок, не звонок',
    refine: 'свой item только в истории; в сводке доработка пишется как call',
} as const satisfies Partial<Record<AiAnalyticsKpiEventTypeCode, string>>;
