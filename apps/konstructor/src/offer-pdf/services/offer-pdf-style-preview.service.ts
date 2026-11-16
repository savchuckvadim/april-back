import { Injectable, NotFoundException } from '@nestjs/common';
import { pdfFirstPage } from '@app/konstructor/document-generate/lib/pdf-first-page.util';
import { sampleOfferPdfModel } from '../lib/sample-offer-pdf-model';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { findPalette } from '../templates/kit/theme/offer-pdf-palette';
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
    /** Ключ — «стиль:гамма»; неизвестная гамма приводится к первой */
    private readonly cache = new Map<string, Promise<Buffer>>();

    constructor(private readonly renderService: OfferPdfRenderService) {}

    preview(
        code: OfferPdfTemplateCode,
        palette?: string | null,
    ): Promise<Buffer> {
        const template = findOfferPdfTemplate(code);
        if (!template) {
            throw new NotFoundException(`PDF-стиль КП «${code}» не найден`);
        }
        const paletteCode =
            findPalette(template.palettes ?? [], palette)?.code ?? null;
        const key = `${code}:${paletteCode ?? ''}`;
        const cached = this.cache.get(key);
        if (cached) return cached;
        const pending = this.build(code, paletteCode).catch(
            (error: unknown) => {
                this.cache.delete(key);
                throw error;
            },
        );
        this.cache.set(key, pending);
        return pending;
    }

    private async build(
        code: OfferPdfTemplateCode,
        palette: string | null,
    ): Promise<Buffer> {
        const rendered = await this.renderService.render(
            sampleOfferPdfModel(code, palette),
        );
        return pdfFirstPage(rendered.buffer);
    }
}
