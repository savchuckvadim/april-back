export type ContractGenerateTemplateProps = {
    contract_number: string;
    contract_date: string;
    header: string;
    contract_start: string;
    contract_end: string;
    we_role: string;
    we_rq: string;
    we_direct_position: string;
    we_direct_fio: string;
    client_role: string;
    client_rq: string;
    client_direct_position: string;
    client_direct_fio: string;
    complect_name: string;
    specification_pk: string;

    specification_pk_comment: string;
    specification_dway: string;
    specification_dway_comment: string;
    specification_email_comment: string;
    specification_complect_name: string;
    specification_complect_name_comment: string;
    infoblocks_left: string[];
    infoblocks_right: string[];
    supply_contract: string;
    supply_comment_1: string;
    logins_quantity: string;
    contract_pay_date: string;
    
    productNumber: string;
    productName: string;
    productQuantity: string;
    productMeasure: string;
    productPrice: string;
    productSum: string;

    total_month_sum: string;
    total_quantity: string;
    total_measure: string;
    total_prepayment_sum: string;

    
    
    
}