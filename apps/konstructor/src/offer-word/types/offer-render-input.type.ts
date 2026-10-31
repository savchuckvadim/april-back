import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';

/**
 * Поля запроса, которые реально нужны сборке данных КП (цены, наполнение,
 * реквизиты, получатель, менеджер). Узкий тип — чтобы одни и те же
 * render-data-сервисы кормили и Word-генерацию по шаблону, и PDF-генерацию
 * из JSX (offer-pdf): данные документа считаются одним кодом.
 */
export type OfferRenderInput = Pick<
    OfferWordByTemplateGenerateDto,
    | 'providerId'
    | 'contractType'
    | 'complect'
    | 'rows'
    | 'contract'
    | 'clientType'
    | 'total'
    | 'recipient'
    | 'manager'
    | 'sets'
>;
