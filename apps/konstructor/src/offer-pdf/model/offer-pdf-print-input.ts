import { SingleDocumentRequest } from '@app/konstructor/offer-word/multi/lib/variants/with-variant';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';

/** Запрос одного печатаемого документа: без вариантов, участник уже подставлен. */
export type OfferPdfPrintInput = SingleDocumentRequest<OfferPdfGenerateDto>;
