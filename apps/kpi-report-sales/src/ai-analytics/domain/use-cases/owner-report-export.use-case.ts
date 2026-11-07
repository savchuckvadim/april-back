import { Injectable, Logger } from '@nestjs/common';
import type {
    OwnerReportExportJobData,
    OwnerReportExportState,
} from '@lib/sales-ai-analytics';
import { OwnerReportExportStore } from '@lib/sales-ai-analytics/owner-report-export';
import { OwnerReportPdfService } from '../../owner-report/owner-report-pdf.service';
import { OwnerReportSourceService } from '../../owner-report/owner-report-source.service';
import { SettingsLoader } from '../loaders/settings.loader';

/** Текст ошибки выгрузки для админки, если причина неизвестна. */
export const OWNER_REPORT_EXPORT_FAILED =
    'Не удалось собрать PDF отчёта: подробности в журнале kpi-report-sales';

/**
 * Выгрузка PDF отчёта собственнику для админки: готовый отчёт периода
 * (снапшот или сборка, по просьбе — заново) → PDF → Redis на сутки.
 * Ничего не шлёт и в Битрикс не пишет. Ошибка — в состояние с текстом,
 * джоба не падает: повтор — той же кнопкой.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class OwnerReportExportUseCase {
    private readonly logger = new Logger(OwnerReportExportUseCase.name);

    constructor(
        private readonly source: OwnerReportSourceService,
        private readonly pdf: OwnerReportPdfService,
        private readonly settings: SettingsLoader,
        private readonly store: OwnerReportExportStore,
    ) {}

    async execute(
        data: OwnerReportExportJobData,
        now = new Date(),
    ): Promise<OwnerReportExportState> {
        await this.store.writeState(data, { status: 'processing' }, now);
        try {
            const report = await this.source.get(data, data.forceRefresh, now);
            const settings = await this.settings.load(data.domain);
            const rendered = await this.pdf.render(
                report,
                settings.calendar.timeZone,
            );
            await this.store.writePdf(data, rendered.buffer);
            this.logger.log(
                `Выгрузка отчёта ${data.domain} ${data.kind} ${data.periodKey}: ${rendered.buffer.length} байт`,
            );
            return this.store.writeState(data, {
                status: 'ready',
                filename: rendered.filename,
                sizeBytes: rendered.buffer.length,
            });
        } catch (error) {
            const message =
                (error as Error).message || OWNER_REPORT_EXPORT_FAILED;
            this.logger.warn(
                `Выгрузка отчёта ${data.domain} ${data.kind} ${data.periodKey} упала: ${message}`,
            );
            return this.store.writeState(data, { status: 'error', message });
        }
    }
}
