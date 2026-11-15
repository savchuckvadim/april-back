import { Injectable, NotFoundException } from '@nestjs/common';
import { pdfFirstPage } from '@app/konstructor/document-generate/lib/pdf-first-page.util';
import { sampleOfferPdfModel } from '../lib/sample-offer-pdf-model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { findOfferPdfTemplate } from '../templates/offer-pdf-template.registry';
import { OfferPdfRenderService } from './offer-pdf-render.service';

/**
 * Превью стиля для выбора: первая страница (титульник или первый лист)
 * на образце «Гарант-Офис». Стили живут в коде и меняются только выкладкой,
 * поэтому превью держится в памяти процесса до перезапуска; параллельные
 * запросы одного стиля ждут один рендер.
 */
@Injectable()
export class OfferPdfStylePreviewService {
    private readonly cache = new Map<OfferPdfTemplateCode, Promise<Buffer>>();

    constructor(private readonly renderService: OfferPdfRenderService) {}

    preview(code: OfferPdfTemplateCode): Promise<Buffer> {
        if (!findOfferPdfTemplate(code)) {
            throw new NotFoundException(`PDF-стиль КП «${code}» не найден`);
        }
        const cached = this.cache.get(code);
        if (cached) return cached;
        const pending = this.build(code).catch((error: unknown) => {
            this.cache.delete(code);
            throw error;
        });
        this.cache.set(code, pending);
        return pending;
    }

    private async build(code: OfferPdfTemplateCode): Promise<Buffer> {
        const rendered = await this.renderService.render(
            sampleOfferPdfModel(code),
        );
        return pdfFirstPage(rendered.buffer);
    }
}
