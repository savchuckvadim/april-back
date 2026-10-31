import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import { registerOfferPdfFonts } from '../fonts/offer-pdf-fonts';
import { OfferPdfDocumentModel } from '../model/offer-pdf-document.model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { findOfferPdfTemplate } from '../templates/offer-pdf-template.registry';

export interface OfferPdfRenderResult {
    buffer: Buffer;
    /** Время рендера в мс — контроль «быстрее Gotenberg» */
    durationMs: number;
    templateCode: OfferPdfTemplateCode;
}

/** Модель → шаблон → PDF. Без диска, без ссылок: чистый рендер. */
@Injectable()
export class OfferPdfRenderService {
    private readonly logger = new Logger(OfferPdfRenderService.name);

    async render(model: OfferPdfDocumentModel): Promise<OfferPdfRenderResult> {
        const template = findOfferPdfTemplate(model.templateCode);
        if (!template) {
            throw new NotFoundException(
                `PDF-шаблон КП «${model.templateCode}» не найден`,
            );
        }
        registerOfferPdfFonts();

        const started = performance.now();
        const buffer = await renderToBuffer(template.render(model));
        const durationMs = Math.round(performance.now() - started);
        this.logger.log(
            `КП «${template.code}»: ${buffer.length} байт за ${durationMs} мс`,
        );

        return { buffer, durationMs, templateCode: template.code };
    }
}
