import { SALES_DOCUMENT_KIND, SalesDocumentKind } from '@lib/queue';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    PBX_SALES_KONSTRUCTOR_FIELD_CODES,
    PbxSalesKonstructorFieldCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import {
    PBX_SALES_KPI_LIST_FIELD_ITEM_CODES,
    PbxSalesKpiListFieldItemCode,
} from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';

type KpiEventTypeCode = PbxSalesKpiListFieldItemCode<'event_type'>;
type KpiEventActionCode = PbxSalesKpiListFieldItemCode<'event_action'>;

const KPI_TYPE = PBX_SALES_KPI_LIST_FIELD_ITEM_CODES.event_type;
const KPI_ACTION = PBX_SALES_KPI_LIST_FIELD_ITEM_CODES.event_action;
const FIELD = PBX_SALES_KONSTRUCTOR_FIELD_CODES;

/** Что документ меняет, если сформирован в продолжение презентации. */
export interface EventDocumentAfterPresentationRule {
    /** Название записи «ОП KPI». */
    readonly title: string;
    /** «ОП Текущий статус» карточки. */
    readonly statusText: string;
    /** Счётчик «… после презентации». */
    readonly counterField: PbxSalesKonstructorFieldCode;
    /** Тип события: пишется только в «ОП KPI», в «Историю» не идёт. */
    readonly kpiEventType: KpiEventTypeCode;
}

/** Всё, что один вид документа меняет в Битриксе. */
export interface EventDocumentKindRule {
    /** Название записи в «ОП KPI» и «ОП История». */
    readonly title: string;
    /** «ОП Текущий статус» карточки. */
    readonly statusText: string;
    /** Стадия «ОП Основная», до которой документ продвигает сделку. */
    readonly baseStage: PbxDealSalesBaseStageCode;
    /** Счётчик документов в карточке. */
    readonly counterField: PbxSalesKonstructorFieldCode;
    /** Дата последнего документа; null — такого поля нет. */
    readonly dateField: PbxSalesKonstructorFieldCode | null;
    readonly kpiEventType: KpiEventTypeCode;
    readonly kpiEventAction: KpiEventActionCode;
    /** null — у документа нет варианта «после презентации». */
    readonly afterPresentation: EventDocumentAfterPresentationRule | null;
}

/**
 * Правила потока документов — единственное место, где вид документа
 * превращается в стадию, поля и типы событий.
 *
 * Отличие от легаси (`EventDocumentService` в Laravel): договор считается
 * договором, а не КП — у него свой счётчик, своя дата и свой тип события.
 * Стадия у договора та же, что у КП и счёта (решение владельца 24.11.2026).
 */
export const EVENT_DOCUMENT_KIND_RULES: Readonly<
    Record<SalesDocumentKind, EventDocumentKindRule>
> = {
    [SALES_DOCUMENT_KIND.offer]: {
        title: 'КП',
        statusText: 'Коммерческое предложение',
        baseStage: PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate,
        counterField: FIELD.op_offer_q,
        dateField: FIELD.op_offer_date,
        kpiEventType: KPI_TYPE.ev_offer,
        kpiEventAction: KPI_ACTION.act_send,
        afterPresentation: {
            title: 'КП после презентации',
            statusText: 'Коммерческое предложение после презентации',
            counterField: FIELD.op_offer_pres_q,
            kpiEventType: KPI_TYPE.ev_offer_pres,
        },
    },
    [SALES_DOCUMENT_KIND.invoice]: {
        title: 'Счет',
        statusText: 'Счет',
        baseStage: PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate,
        counterField: FIELD.op_invoice_q,
        dateField: FIELD.op_invoice_date,
        kpiEventType: KPI_TYPE.ev_invoice,
        kpiEventAction: KPI_ACTION.act_send,
        afterPresentation: {
            title: 'Счет после презентации',
            statusText: 'Счет после презентации',
            counterField: FIELD.op_invoice_pres_q,
            kpiEventType: KPI_TYPE.ev_invoice_pres,
        },
    },
    [SALES_DOCUMENT_KIND.contract]: {
        title: 'Договор',
        statusText: 'Договор',
        baseStage: PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate,
        counterField: FIELD.op_contract_q,
        dateField: FIELD.op_contract_date,
        kpiEventType: KPI_TYPE.ev_contract,
        kpiEventAction: KPI_ACTION.act_send,
        afterPresentation: null,
    },
    [SALES_DOCUMENT_KIND.supply]: {
        title: 'Отчет о поставке',
        statusText: 'Поставка',
        baseStage: PBX_DEAL_SALES_BASE_STAGE_CODE.supply,
        counterField: FIELD.op_supplies_q,
        dateField: null,
        kpiEventType: KPI_TYPE.ev_supply,
        kpiEventAction: KPI_ACTION.done,
        afterPresentation: null,
    },
};

/**
 * Порядок, в котором несколько документов одного события ложатся в
 * карточку: статус и стадия берутся у последнего (КП со счётом → «Счет»).
 */
const KIND_PRIORITY: readonly SalesDocumentKind[] = [
    SALES_DOCUMENT_KIND.offer,
    SALES_DOCUMENT_KIND.invoice,
    SALES_DOCUMENT_KIND.contract,
    SALES_DOCUMENT_KIND.supply,
];

/** Виды документов события без повторов, в порядке применения правил. */
export const orderDocumentKinds = (
    kinds: readonly SalesDocumentKind[],
): SalesDocumentKind[] => KIND_PRIORITY.filter(kind => kinds.includes(kind));
