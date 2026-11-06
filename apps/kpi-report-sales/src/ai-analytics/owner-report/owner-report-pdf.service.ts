import { createElement } from 'react';
import { Injectable, Logger } from '@nestjs/common';
import { renderPdfToBuffer } from '@lib/pdf-render';
import { formatRuDate, toPortalDate } from '@lib/sales-ai-analytics';
import type { AiOwnerReportDto } from '../dto/ai-owner-report.dto';
import { OwnerReportPdfDocument } from './pdf/OwnerReportPdfDocument';

export interface OwnerReportPdfResult {
    buffer: Buffer;
    /** Имя файла для Content-Disposition (латиницей — без проблем с заголовками). */
    filename: string;
    durationMs: number;
}

/**
 * PDF отчёта собственнику из готового DTO (снапшота): документ react-pdf
 * со встроенными шрифтами → байты. Ничего не считает и не сохраняет —
 * один и тот же отчёт на витрине и в файле.
 */
@Injectable()
export class OwnerReportPdfService {
    private readonly logger = new Logger(OwnerReportPdfService.name);

    async render(
        report: AiOwnerReportDto,
        timeZone: string,
    ): Promise<OwnerReportPdfResult> {
        const generatedAtText = formatRuDate(
            toPortalDate(new Date(report.generatedAt), timeZone),
        );
        const rendered = await renderPdfToBuffer(
            createElement(OwnerReportPdfDocument, { report, generatedAtText }),
        );
        const filename = `sales-report-${report.kind}-${report.periodKey}.pdf`;
        this.logger.log(
            `PDF отчёта ${report.kind} ${report.periodKey}: ${rendered.buffer.length} байт за ${rendered.durationMs} мс`,
        );
        return {
            buffer: rendered.buffer,
            filename,
            durationMs: rendered.durationMs,
        };
    }
}
