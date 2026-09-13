/**
 * Коды полей RPA «Поставка», из которых собирается сервисная сделка.
 * Только коды — реальные `UF_RPA_{typeId}_*` резолвит PortalModel
 * (ai/rules/pbx-typing.md: никаких магических строк).
 */
export const INIT_DEAL_RPA_FIELD = {
    /** «Перезаключение?» — им пользователь и фильтрует поставки от перезаключений */
    isExtension: 'is_extension',
    company: 'rpa_crm_company',
    contacts: 'rpa_crm_contacts',
    baseDeal: 'rpa_crm_base_deal',
    managerOs: 'manager_os',
    managerEdu: 'manager_edu',
    serviceOfferSmart: 'service_offer_smart',
    contractEnd: 'contract_end',
    armClientId: 'rpa_arm_client_id',
    armComplectId: 'rpa_arm_complect_id',
    currentInvoice: 'current_invoice',
    currentSupply: 'current_suply',
    currentContract: 'current_contract',
} as const;

export type InitDealRpaFieldCode =
    (typeof INIT_DEAL_RPA_FIELD)[keyof typeof INIT_DEAL_RPA_FIELD];

/**
 * Коды полей сделки, которые сервисная сделка получает «с нуля»: файлы текущих
 * документов не переносятся из базовой сделки — по ним сервис работает заново.
 */
export const CLEARED_DEAL_FIELD_CODES = [
    'current_contract',
    'current_invoice',
    'current_suply',
] as const;
