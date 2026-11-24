import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';

/**
 * Поля запроса, по которым собираются счета и подбирается их шаблон. Узкий
 * тип нужен, чтобы счета строили и Word-КП, и PDF-КП: у PDF-запроса нет
 * части полей Word-шаблона, а счёту они ни к чему.
 *
 * Шаблон подбирается по домену, поставщику (`providerId`), типу клиента
 * (`clientType`) и виду поставки (`supply.type`); явный `invoiceTemplateId`
 * сильнее подбора, пустой — «подобрать самому».
 */
export type InvoiceBuildRequest = Pick<
    OfferWordByTemplateGenerateDto,
    | 'domain'
    | 'userId'
    | 'providerId'
    | 'clientType'
    | 'supply'
    | 'recipient'
    | 'contractType'
    | 'contract'
    | 'sets'
    | 'invoice'
> & {
    invoiceTemplateId?: string;
};
