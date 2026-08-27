import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { CallReportWeeklyDataService } from './call-report-weekly-data.service';
import { CallReportExcelBuilder } from './call-report-excel.builder';
import { CallReportWeeklyDeliveryService } from './call-report-weekly-delivery.service';
import { CallReportWeeklyResult } from './call-report-weekly.types';

/**
 * Недельный Excel-отчёт по звонкам портала: собрать → построить книгу →
 * положить на Диск → уведомить получателей.
 *
 * Зачем файл вообще нужен: карточка смарта вмещает только выжимки
 * (лимит строки таблицы Битрикса), поэтому полные разборы, речь, хвост/5К,
 * сверка с отчётом менеджера и транскрипт собираются сюда.
 */
@Injectable()
export class SendCallReportWeeklyUseCase {
    private readonly logger = new Logger(SendCallReportWeeklyUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly settings: PortalAiSettingsService,
        private readonly data: CallReportWeeklyDataService,
        private readonly excel: CallReportExcelBuilder,
        private readonly delivery: CallReportWeeklyDeliveryService,
    ) {}

    /**
     * @param domain портал
     * @param period период отчёта; по умолчанию — последние 7 дней
     */
    async execute(
        domain: string,
        period?: { from: Date; to: Date },
    ): Promise<CallReportWeeklyResult> {
        const to = period?.to ?? new Date();
        const from =
            period?.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

        const dataset = await this.data.collect(domain, from, to);
        const portalSettings = await this.settings.getByDomain(domain);
        const recipients = portalSettings?.weeklyReportRecipients ?? [];
        const folderId = portalSettings?.weeklyReportFolderId ?? null;

        if (!dataset.rows.length) {
            this.logger.log(
                `Недельный отчёт ${domain}: за период звонков нет — файл не создаю`,
            );
            return {
                domain,
                from: from.toISOString(),
                to: to.toISOString(),
                calls: 0,
                fileId: null,
                fileUrl: null,
                notifiedUserIds: [],
            };
        }

        const content = await this.excel.build(dataset);
        const fileName = this.buildFileName(domain, from, to);
        const { bitrix } = await this.pbxService.init(domain);
        const uploaded = await this.delivery.upload(
            bitrix,
            fileName,
            content,
            folderId,
        );

        const notifiedUserIds = recipients.length
            ? await this.delivery.notify(
                  bitrix,
                  recipients,
                  this.buildMessage(
                      dataset.rows.length,
                      from,
                      to,
                      uploaded.fileUrl,
                  ),
              )
            : [];

        this.logger.log(
            `Недельный отчёт ${domain}: звонков ${dataset.rows.length}, ` +
                `файл ${uploaded.fileId ?? '—'}, получателей ${notifiedUserIds.length}`,
        );
        return {
            domain,
            from: from.toISOString(),
            to: to.toISOString(),
            calls: dataset.rows.length,
            fileId: uploaded.fileId,
            fileUrl: uploaded.fileUrl,
            notifiedUserIds,
        };
    }

    /** «call-report_alfacentr_2026-08-21_2026-08-27.xlsx». */
    private buildFileName(domain: string, from: Date, to: Date): string {
        const portal = domain.split('.')[0] || 'portal';
        const day = (value: Date): string => value.toISOString().slice(0, 10);
        return `call-report_${portal}_${day(from)}_${day(to)}.xlsx`;
    }

    private buildMessage(
        calls: number,
        from: Date,
        to: Date,
        fileUrl: string | null,
    ): string {
        const period = `${this.formatDate(from)} — ${this.formatDate(to)}`;
        const link = fileUrl
            ? `\nФайл: ${fileUrl}`
            : '\nФайл лежит на Диске портала (папка отчётов по звонкам).';
        return (
            `[b]Недельный отчёт по звонкам[/b] (${period})\n` +
            `Разобрано звонков: ${calls}. В файле — полные разборы, ` +
            `рекомендации, хвост и 5К, сверка с отчётами менеджеров и ` +
            `транскрипты (в карточке смарта они помещаются только в ` +
            `сокращённом виде).${link}`
        );
    }

    private formatDate(value: Date): string {
        return value.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Europe/Moscow',
        });
    }
}
