/**
 * РПА «Заявка на презентацию» в слепке портала: код процесса, коды его
 * полей и стадия «утверждено».
 *
 * Коды полей — те же, что заполняло легаси
 * (`BitrixRPAPresFlowService::getRPAPresInitFlowBatchCommand`) и которые
 * бизнес-процесс согласования отдаёт роботу параметрами ручки
 * `tmc/presentation-approved`. UF-имена на портале свои
 * (`UF_RPA_7_NEXT_PRES_PLAN_DATE` на gsr) — их отдаёт
 * `PortalModel.getRpaFieldBitrixIdByCode`.
 */
export const RPA_PRESENTATION_CODE = 'presentation';

export const RPA_PRESENTATION_FIELD = {
    /** Название заявки. */
    name: 'name',
    /** «ОП Дата назначенной презентации» — на какую дату согласована презентация. */
    nextPresPlanDate: 'next_pres_plan_date',
    /** «ОП Кто назначил последнюю заявку на презентацию» — ТМЦ-менеджер, подавший заявку. */
    lastPresPlanResponsible: 'last_pres_plan_responsible',
    /** «ОП Кто назначен ответственным» — менеджер ОП, назначенный при утверждении. */
    lastPresDoneResponsible: 'last_pres_done_responsible',
    /** «Руководитель» — кто согласует заявку (постановщик плана). */
    ownerOp: 'owner_op',
    company: 'rpa_crm_company',
    contact: 'rpa_crm_contact',
    tmcDeal: 'rpa_crm_tmc_deal',
    /** Комментарии к заявке — множественные строковые поля. */
    tmcComment: 'rpa_tmc_comment',
    ownerComment: 'rpa_owner_comment',
    managerComment: 'rpa_manager_comment',
} as const;

export type RpaPresentationFieldCode =
    (typeof RPA_PRESENTATION_FIELD)[keyof typeof RPA_PRESENTATION_FIELD];

/**
 * Стадия РПА «Утверждено» (семантика SUCCESS): в неё заявка попадает после
 * согласования, и из неё робот зовёт ручку. Код — из pbx-слепка, он же
 * `code` стадии в `rpa.stage.listForType`.
 */
export const RPA_PRESENTATION_APPROVED_STAGE_CODE = 'rpa_pres_success';
