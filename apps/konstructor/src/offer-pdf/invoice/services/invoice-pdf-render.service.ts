import { Injectable, Logger } from '@nestjs/common';
import { prepareOfferPdfFonts } from '../../fonts/offer-pdf-fonts';
import { renderPdfWithLayout, type LayoutNode } from '../../lib/pdf-layout';
import { renderInvoicePdf } from '../invoice-pdf.template';
import { InvoicePdfModel } from '../model/invoice-pdf.model';

export interface InvoicePdfRenderResult {
    buffer: Buffer;
    /** Время рендера в мс */
    durationMs: number;
    /** Дерево раскладки: для аудита и отладки */
    layout: LayoutNode;
}

/**
 * Модель счёта → PDF. Без диска и ссылок: чистый рендер тем же движком
 * (@react-pdf/renderer, шрифты и метрики), что и PDF-КП. У счёта нет шапки и
 * подвала КП, поэтому подгонять поля вторым проходом не нужно: одного
 * прохода хватает.
 */
@Injectable()
export class InvoicePdfRenderService {
    private readonly logger = new Logger(InvoicePdfRenderService.name);

    async render(model: InvoicePdfModel): Promise<InvoicePdfRenderResult> {
        await prepareOfferPdfFonts();
        const started = performance.now();
        const rendered = await renderPdfWithLayout(renderInvoicePdf(model));
        const durationMs = Math.round(performance.now() - started);
        this.logger.log(
            `Счёт «${model.styleCode}»: ${rendered.buffer.length} байт за ${durationMs} мс`,
        );
        return {
            buffer: rendered.buffer,
            durationMs,
            layout: rendered.layout,
        };
    }
}
