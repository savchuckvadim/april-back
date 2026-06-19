/** Базовая опция select-а для формы (id + человекочитаемые подписи). */
export interface SelectOption {
    id: number;
    name: string;
    title: string;
}

/** Опция select-а для поля `contract_type` (item bitrix-поля сделки). */
export interface ContractTypeItemOption extends SelectOption {
    code: string;
    bitrixId: number;
}

/**
 * Initial-данные для формы создания `portal_contract` (аналог legacy
 * `PortalContract::getForm`). Все select-ы для relation-полей.
 */
export interface PortalContractFormData {
    /** Доступные порталы (relation `portal_id`). */
    portals: SelectOption[];
    /** Глобальные виды договоров (relation `contract_id`). */
    contracts: SelectOption[];
    /** Портальные единицы измерения данного портала (relation `portal_measure_id`). */
    portalMeasures: SelectOption[];
    /** Items поля `contract_type` сделки портала (relation `bitrixfield_item_id`). */
    contractTypeItems: ContractTypeItemOption[];
}

/** Код bitrix-поля сделки, items которого используются как тип договора. */
export const CONTRACT_TYPE_FIELD_CODE = 'contract_type';
