export enum PbxDealCategoryCodeEnum {
    service_base = 'service_base',
    sales_base = 'sales_base',
    sales_presentation = 'sales_presentation',
    tmc_base = 'tmc_base',
}
export enum PortalDealServiceStageCodeEnum {
    new = 'service_new',
    supply = 'service_supply',
    first_edu = 'service_first_edu',
    in_work = 'service_in_work',
    reg_six = 'service_reg_six',
    reg_three = 'service_reg_three',
    reg_one = 'service_reg_one',
    reg_two_weeks = 'service_reg_two_weeks',
    reg_in_proccess = 'service_reg_in_proccess',
    success = 'service_success',
    fail = 'service_fail',
    double = 'service_double',
}

export enum PortalDealSalesBaseStageCodeEnum {
    new = 'sales_new',
    warm = 'sales_warm',
    presentation = 'sales_presentation',
    document_send = 'sales_document_send',
    in_progress = 'sales_in_progress',
    money_await = 'sales_money_await',
}
export enum PortalDealSalesPresentationStageCodeEnum {
    new = 'sales_presentation_new',
    warm = 'sales_presentation_warm',
    presentation = 'sales_presentation_presentation',
    document_send = 'sales_presentation_document_send',
    in_progress = 'sales_presentation_in_progress',
    money_await = 'sales_presentation_money_await',
}
export enum PortalDealTmcBaseStageCodeEnum {
    new = 'tmc_base_new',
    warm = 'tmc_base_warm',
    presentation = 'tmc_base_presentation',
    document_send = 'tmc_base_document_send',
    in_progress = 'tmc_base_in_progress',
    money_await = 'tmc_base_money_await',
}

export const PortalDealServiceStages = [
    {
        name: 'service_new',
        code: PortalDealServiceStageCodeEnum.new,
    },
    {
        name: 'service_supply',
        code: PortalDealServiceStageCodeEnum.supply,
    },
    {
        name: 'service_first_edu',
        code: PortalDealServiceStageCodeEnum.first_edu,
    },
    {
        name: 'service_in_work',
        code: PortalDealServiceStageCodeEnum.in_work,
    },
    {
        name: 'service_reg_six',
        code: PortalDealServiceStageCodeEnum.reg_six,
    },
    {
        name: 'service_reg_three',
        code: PortalDealServiceStageCodeEnum.reg_three,
    },
    {
        name: 'service_reg_one',
        code: PortalDealServiceStageCodeEnum.reg_one,
    },
    {
        name: 'service_reg_two_weeks',
        code: PortalDealServiceStageCodeEnum.reg_two_weeks,
    },
    {
        name: 'service_reg_in_proccess',
        code: PortalDealServiceStageCodeEnum.reg_in_proccess,
    },
    {
        name: 'service_success',
        code: PortalDealServiceStageCodeEnum.success,
    },
    {
        name: 'service_fail',
        code: PortalDealServiceStageCodeEnum.fail,
    },
    {
        name: 'service_double',
        code: PortalDealServiceStageCodeEnum.double,
    },
]
export const PortalDealSalesBaseStages = [
    {
        name: 'sales_new',
        code: PortalDealSalesBaseStageCodeEnum.new,
    },
    {
        name: 'sales_warm',
        code: PortalDealSalesBaseStageCodeEnum.warm,
    },
    {
        name: 'sales_presentation',
        code: PortalDealSalesBaseStageCodeEnum.presentation,
    },
    {
        name: 'sales_document_send',
        code: PortalDealSalesBaseStageCodeEnum.document_send,
    },
    {
        name: 'sales_in_progress',
        code: PortalDealSalesBaseStageCodeEnum.in_progress,
    },
    {
        name: 'sales_money_await',
        code: PortalDealSalesBaseStageCodeEnum.money_await,
    },
]
export const PortalDealSalesPresentationStages = [
    {
        name: 'sales_presentation_new',
        code: PortalDealSalesPresentationStageCodeEnum.new,
    },
    {
        name: 'sales_presentation_warm',
        code: PortalDealSalesPresentationStageCodeEnum.warm,
    },
    {
        name: 'sales_presentation_presentation',
        code: PortalDealSalesPresentationStageCodeEnum.presentation,
    },
    {
        name: 'sales_presentation_document_send',
        code: PortalDealSalesPresentationStageCodeEnum.document_send,
    },
    {
        name: 'sales_presentation_in_progress',
        code: PortalDealSalesPresentationStageCodeEnum.in_progress,
    },
    {
        name: 'sales_presentation_money_await',
        code: PortalDealSalesPresentationStageCodeEnum.money_await,
    },
]
export const PortalDealTmcStages = [
    {
        name: 'tmc_base_new',
        code: PortalDealTmcBaseStageCodeEnum.new,
    },
    {
        name: 'tmc_base_warm',
        code: PortalDealTmcBaseStageCodeEnum.warm,
    },
    {
        name: 'tmc_base_presentation',
        code: PortalDealTmcBaseStageCodeEnum.presentation,
    },
    {
        name: 'tmc_base_document_send',
        code: PortalDealTmcBaseStageCodeEnum.document_send,
    },
    {
        name: 'tmc_base_in_progress',
        code: PortalDealTmcBaseStageCodeEnum.in_progress,
    },
    {
        name: 'tmc_base_money_await',
        code: PortalDealTmcBaseStageCodeEnum.money_await,
    },
]
export const PbxDealsData = {
    [PbxDealCategoryCodeEnum.service_base]: {
        stages: PortalDealServiceStages,
    },
    [PbxDealCategoryCodeEnum.sales_base]: {
        stages: PortalDealSalesBaseStages,
    },
    [PbxDealCategoryCodeEnum.sales_presentation]: {
        stages: PortalDealSalesPresentationStages,
    },
    [PbxDealCategoryCodeEnum.tmc_base]: {
        stages: PortalDealTmcStages,
    },
} as const;
// 5️⃣ Автоматически выводим тип для каждой категории
export type CategoryToStageMap = {
    [K in keyof typeof PbxDealsData]:
    (typeof PbxDealsData)[K]['stages'][number]['code'];
};

export interface IPbxDataStage {
    name: string;
    code: string;
}
