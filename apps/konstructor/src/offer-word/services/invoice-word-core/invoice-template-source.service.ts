import { Injectable, Logger } from '@nestjs/common';
import { DocumentTemplateService } from '@lib/portal-lib/konstructor/document-template';
import { InvoiceTemplateService } from '@app/konstructor/modules/invoice-template';
import type { InvoiceTemplate } from 'generated/prisma';
import { ClientTypeEnum } from '../../../document-generate/type/client.type';

/**
 * Признаки запроса, по которым выбирается шаблон счёта. Берутся из DTO
 * генерации КП; узкий тип позволяет проверять подбор без сборки всего DTO.
 */
export interface InvoiceTemplateRequest {
    domain: string;
    providerId: number;
    clientType: ClientTypeEnum;
    /** Пустая строка (фронт шлёт её всегда) — «подобрать шаблон самому». */
    invoiceTemplateId?: string;
    supply?: { type?: string };
}

/** Причина для менеджера, когда подходящего шаблона счёта нет. */
export const INVOICE_TEMPLATE_NOT_FOUND_REASON =
    'для портала не найден шаблон счёта';

/**
 * Откуда брать шаблон счёта.
 *
 * Явный `invoiceTemplateId` — шаблон по id, как раньше (нет такой строки —
 * ошибка 404). Пустой id — подбор через `DocumentTemplateService.resolveInvoice`
 * по порталу (из домена), поставщику, типу клиента и типу поставки, как это
 * делает договор. Подходящего шаблона нет — ответ `null`: вызывающий решает,
 * как сообщить об этом менеджеру.
 */
@Injectable()
export class InvoiceTemplateSourceService {
    private readonly logger = new Logger(InvoiceTemplateSourceService.name);

    constructor(
        private readonly invoiceTemplateService: InvoiceTemplateService,
        private readonly documentTemplateService: DocumentTemplateService,
    ) {}

    async resolve(
        request: InvoiceTemplateRequest,
    ): Promise<InvoiceTemplate | null> {
        const explicitId = request.invoiceTemplateId?.trim();
        if (explicitId) {
            return this.invoiceTemplateService.innerFindById(explicitId);
        }

        const supplyType = request.supply?.type;
        const resolved = await this.documentTemplateService.resolveInvoice({
            domain: request.domain,
            providerId: request.providerId,
            clientType: request.clientType,
            supplyType,
        });
        if (!resolved.match) {
            this.logger.warn(
                `${request.domain}: шаблон счёта не найден (поставщик ${request.providerId}, клиент ${request.clientType}, поставка ${supplyType ?? 'не указана'})`,
            );
            return null;
        }

        const { candidate, reason } = resolved.match;
        this.logger.log(
            `Шаблон счёта #${candidate.id} (домен ${request.domain}). ${reason}`,
        );
        // Ответ core-сервиса отдаёт шаблон целиком, поэтому строку читаем
        // по id, который назвал подбор.
        return this.invoiceTemplateService.innerFindById(candidate.id);
    }
}
