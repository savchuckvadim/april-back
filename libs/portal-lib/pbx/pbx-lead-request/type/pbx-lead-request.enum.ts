import {
    PbxSalesEventFieldCode,
    PbxSalesEventFieldItemCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Тотальная типизация домена «Заявка/Лид ОП» (карточка заявки в приложении
 * «Звонки», хуки lead-to-work / duplicate-check, синк финалов event-report).
 *
 * Значения каждого enum строго равны кодам полей/items из
 * `PBX_SALES_EVENT_FIELDS` — это проверяется compile-time блоками
 * `satisfies` внизу файла: опечатка или рассинхрон с константой полей не
 * соберётся. Никаких `string` там, где код.
 */

/** Поля лида, образующие карточку заявки. */
export enum EnumLeadRequestFieldCode {
    /** Статус Лида (наш агрегированный статус работы). */
    op_lead_status = 'op_lead_status',
    /** Статус Заявки (лидоген/сайт). */
    op_lead_site_status = 'op_lead_site_status',
    /** Стадия Заявки. */
    op_lead_site_stage = 'op_lead_site_stage',
    /** Стадия связанной основной сделки (зеркало). */
    op_leads_related_base_stage = 'op_leads_related_base_stage',
    /** Тип «не ЦА». */
    op_lead_not_ca_type = 'op_lead_not_ca_type',
    /** «Не звонить никогда». */
    op_lead_is_black_short = 'op_lead_is_black_short',
    /** Причина «не звонить никогда». */
    op_lead_black_short_reason = 'op_lead_black_short_reason',
    /** Время обработки заявки (сек). */
    op_lead_firstprepare_long = 'op_lead_firstprepare_long',
    /** История обработки заявки (multiple, append-only). */
    op_lead_firstprepare_history = 'op_lead_firstprepare_history',
    /** Установлена компания. */
    op_lead_is_company = 'op_lead_is_company',
    /** Отправлен отчёт в НПП. */
    op_lead_is_npp_repoted = 'op_lead_is_npp_repoted',
    /** Проверено на дубли (установлен ИНН). */
    op_lead_is_duplicate_check = 'op_lead_is_duplicate_check',
    /** Найдены дубли. */
    op_lead_is_duplicate = 'op_lead_is_duplicate',
    /** Присоединён к существующей работе. */
    op_lead_is_merged_by_exist = 'op_lead_is_merged_by_exist',
    /** Повлиял на продажу. */
    op_lead_is_boost_sale = 'op_lead_is_boost_sale',
}

/** Статус Заявки (op_lead_site_status). */
export enum EnumLeadSiteStatusCode {
    /** Появилась. */
    appeared = 'op_lead_site_status1',
    /** Взята в работу. */
    taken = 'op_lead_site_status2',
    /** Не ЦА. */
    notCa = 'op_lead_site_status3',
    /** Ведётся активная работа. */
    active = 'op_lead_site_status4',
    /** Отказ. */
    fail = 'op_lead_site_status5',
}

/** Стадия Заявки (op_lead_site_stage). */
export enum EnumLeadSiteStageCode {
    /** Назначена менеджеру. */
    assigned = 'op_lead_site_stage1',
    /** Взята в работу. */
    taken = 'op_lead_site_stage2',
    /** Запланирован звонок. */
    callPlanned = 'op_lead_site_stage3',
    /** Проведена презентация. */
    presentationDone = 'op_lead_site_stage4',
    /** Установлена компания. */
    companySet = 'op_lead_site_stage5',
    /** Есть ИНН / проверено на дубли. */
    duplicateChecked = 'op_lead_site_stage6',
    /** Работа уже велась — присоединили. */
    mergedToExisting = 'op_lead_site_stage7',
    /** Отказ. */
    fail = 'op_lead_site_stage8',
    /** Продажа. */
    sale = 'op_lead_site_stage9',
}

/** Статус Лида (op_lead_status). */
export enum EnumLeadOpStatusCode {
    /** Создан. */
    created = 'op_lead_status_one',
    /** Определён ОП. */
    opAssigned = 'op_lead_status_two',
    /** Передан сотруднику. */
    employeeAssigned = 'op_lead_status_three',
    /** Работа со сделкой. */
    dealWork = 'op_lead_status_four',
    /** Работа с компанией. */
    companyWork = 'op_lead_status_five',
    /** Презентации. */
    presentations = 'op_lead_status_six',
    /** Документы. */
    documents = 'op_lead_status_seven',
    /** Продажа. */
    sale = 'op_lead_status_eight',
    /** Отказ. */
    fail = 'op_lead_status_nine',
    /** Не ЦА. */
    notCa = 'op_lead_status_ten',
}

/** Тип «не ЦА» (op_lead_not_ca_type). */
export enum EnumLeadNotCaTypeCode {
    /** Квартира. */
    apartment = 'op_lead_not_ca_type1',
    /** Не существует телефон. */
    phoneNotExists = 'op_lead_not_ca_type2',
    /** Компания не существует. */
    companyNotExists = 'op_lead_not_ca_type3',
    /** Нет специалистов. */
    noSpecialists = 'op_lead_not_ca_type4',
}

/**
 * ОФИЦИАЛЬНЫЙ статус заявки в ТПС Гаранта (op_lead_tps_status) —
 * внешний словарь из «Правил оценки заявок» (docs/newfields.md):
 * коды семантические, завязаны на документ. Партнёр обязан оценить
 * заявку за 4 рабочих дня, иначе она ротируется другому партнёру.
 */
export enum EnumLeadTpsStatusCode {
    /** Чужой клиент (финальный; ИНН/телефон найден в базе ПОиСК). */
    alienClient = 'tps_alien_client',
    /** Чужая территория (финальный; заявка уйдёт партнёру региона). */
    alienTerritory = 'tps_alien_territory',
    /** Обслуживаемый клиент (финальный; наш действующий клиент). */
    servedClient = 'tps_served_client',
    /** Продажа (финальный; на втором шаге заполняются данные продажи). */
    sale = 'tps_sale',
    /** Отказ (финальный; заявка уходит в повторную ротацию). */
    refuse = 'tps_refuse',
    /** Телефон не отвечает (редактируемый; таймер 90 раб. дней). */
    noAnswer = 'tps_no_answer',
    /** В работе (редактируемый; квота 50%, ротация после 90 раб. дней). */
    inWork = 'tps_in_work',
    /** Бронь (редактируемый; 1 раз; меняется только на Отказ/Продажу). */
    reserve = 'tps_reserve',
}

/** Стадия связанной сделки (op_leads_related_base_stage). */
export enum EnumLeadRelatedBaseStageCode {
    cold = 'op_leads_related_base_stage1',
    inWork = 'op_leads_related_base_stage2',
    presentation = 'op_leads_related_base_stage3',
    documents = 'op_leads_related_base_stage4',
    decision = 'op_leads_related_base_stage5',
    payment = 'op_leads_related_base_stage6',
    sale = 'op_leads_related_base_stage7',
    fail = 'op_leads_related_base_stage8',
    duplicate = 'op_leads_related_base_stage9',
}

/* ------------------------------------------------------------------ *
 * Runtime-массивы для class-validator @IsIn и Swagger enum.
 * ------------------------------------------------------------------ */

export const LEAD_SITE_STATUS_CODES = Object.values(EnumLeadSiteStatusCode);
export const LEAD_SITE_STAGE_CODES = Object.values(EnumLeadSiteStageCode);
export const LEAD_OP_STATUS_CODES = Object.values(EnumLeadOpStatusCode);
export const LEAD_NOT_CA_TYPE_CODES = Object.values(EnumLeadNotCaTypeCode);
export const LEAD_RELATED_BASE_STAGE_CODES = Object.values(
    EnumLeadRelatedBaseStageCode,
);
export const LEAD_TPS_STATUS_CODES = Object.values(EnumLeadTpsStatusCode);

/* ------------------------------------------------------------------ *
 * Compile-time стражи: enum ⊆ коды PBX_SALES_EVENT_FIELDS.
 * Рассинхрон с константой полей = ошибка компиляции, не рантайма.
 * ------------------------------------------------------------------ */

type AssertSubset<T extends U, U> = T;

export type _LeadRequestFieldCodesAreValid = AssertSubset<
    `${EnumLeadRequestFieldCode}`,
    PbxSalesEventFieldCode
>;
export type _LeadSiteStatusCodesAreValid = AssertSubset<
    `${EnumLeadSiteStatusCode}`,
    PbxSalesEventFieldItemCode<'op_lead_site_status'>
>;
export type _LeadSiteStageCodesAreValid = AssertSubset<
    `${EnumLeadSiteStageCode}`,
    PbxSalesEventFieldItemCode<'op_lead_site_stage'>
>;
export type _LeadOpStatusCodesAreValid = AssertSubset<
    `${EnumLeadOpStatusCode}`,
    PbxSalesEventFieldItemCode<'op_lead_status'>
>;
export type _LeadNotCaTypeCodesAreValid = AssertSubset<
    `${EnumLeadNotCaTypeCode}`,
    PbxSalesEventFieldItemCode<'op_lead_not_ca_type'>
>;
export type _LeadRelatedBaseStageCodesAreValid = AssertSubset<
    `${EnumLeadRelatedBaseStageCode}`,
    PbxSalesEventFieldItemCode<'op_leads_related_base_stage'>
>;
export type _LeadTpsStatusCodesAreValid = AssertSubset<
    `${EnumLeadTpsStatusCode}`,
    PbxSalesEventFieldItemCode<'op_lead_tps_status'>
>;
