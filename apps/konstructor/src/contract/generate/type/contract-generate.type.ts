import { RqEntity } from '@lib/portal-lib/konstructor/provider';
import { Product } from '../../../document-generate/product-rows/product-row.service';

/**
 * Ответ генерации договора.
 *
 * `link`, `file` и `document` — одна и та же ссылка под тремя именами:
 * фронт типизирует ответ как `{link, file, document}`, а init-supply берёт
 * именно `file`. До этой задачи отдавались только `link`/`documentName`,
 * поэтому `file` у вызывающего был `undefined`.
 *
 * `data` и `provider` ОСТАВЛЕНЫ намеренно, хотя `provider` — это полный
 * `RqEntity` (включая банк/бик/рс/кс). Grep по обоим репозиториям
 * (april-next/back и front/konstructor) явных читателей этих полей не нашёл,
 * но ручка `POST contract/generate` публичная и ответ не прикрыт
 * DTO-сериализацией, поэтому доказать по коду, что их не читает внешний
 * потребитель, нельзя. Сужение ответа — отдельное решение с заказчиком,
 * а не побочный эффект включения резолвера шаблонов.
 */
export type ContractGenerateResult = {
    link: string;
    /** Та же ссылка; её читает init-supply. */
    file: string;
    /** Та же ссылка; под этим именем её типизирует фронт. */
    document: string;
    documentName: string;
    data: ContractGenerateTemplateProps;
    provider: RqEntity;
};

export type ContractGenerateTemplateProps = {
    contract_number: string;
    contract_date: string;
    header: string;
    contract_start: string;
    contract_end: string;
    we_role: string;
    we_role_case: string;
    we_rq: string[];
    we_direct_position: string;
    we_direct_fio: string;
    client_role: string;
    client_role_case: string;
    client_rq: string[];
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
    infoblocksLeft: string[];
    infoblocksRight: string[];
    supply_contract: string;
    supply_comment_1: string;
    logins_quantity: string;
    contract_pay_date: string;

    // productNumber: string;
    // productName: string;
    // productQuantity: string;
    // productMeasure: string;
    // productPrice: string;
    // productSum: string;
    products: Product[];
    total_month_sum: string;
    total_quantity: string;
    total_measure: string;
    total_prepayment_sum: string;
};
