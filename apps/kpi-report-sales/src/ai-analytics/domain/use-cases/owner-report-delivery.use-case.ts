import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { CallReportWeeklyDeliveryService } from '@lib/call-lib/call-report/weekly-report/call-report-weekly-delivery.service';
import {
    OWNER_REPORT_DELIVERY_REASONS,
    type AiOwnerReportDeliveryJobData,
    type OwnerReportDeliveryResult,
} from '../../owner-report/owner-report-delivery.types';
import { buildOwnerReportMessage } from '../../owner-report/owner-report-message.util';
import { OwnerReportPdfService } from '../../owner-report/owner-report-pdf.service';
import { OwnerReportSourceService } from '../../owner-report/owner-report-source.service';
import { OwnerReportDiskFolderResolver } from '../../owner-report/owner-report-disk-folder.resolver';
import {
    SettingsLoader,
    type AiAnalyticsPortalSettings,
} from '../loaders/settings.loader';

/**
 * Выпуск отчёта собственнику: готовый снапшот (или сборка на месте) →
 * PDF → файл на Диск портала → личные сообщения получателям из настроек
 * или явного списка (ручной «отправить себе»). «Только считать» — всё,
 * кроме сообщений; итог выпуска — в лог с оповещением вендора.
 *
 * `@Injectable` без bitrix-состояния: инстанс Битрикса берётся внутри
 * метода через `PBXService.init(domain)`.
 */
@Injectable()
export class OwnerReportDeliveryUseCase {
    private readonly logger = new Logger(OwnerReportDeliveryUseCase.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly source: OwnerReportSourceService,
        private readonly pdf: OwnerReportPdfService,
        private readonly pbx: PBXService,
        private readonly folders: OwnerReportDiskFolderResolver,
    ) {}

    async execute(
        data: AiOwnerReportDeliveryJobData,
        now = new Date(),
    ): Promise<OwnerReportDeliveryResult> {
        const settings = await this.settings.load(data.domain);
        const explicit = (data.recipients ?? []).filter(id => id > 0);
        const skip = this.skipReason(settings, explicit.length > 0);
        if (skip) return this.finish(data, 'skipped', skip, [], null);
        const recipients =
            explicit.length > 0 ? explicit : settings.ownerReport.userIds;
        if (recipients.length === 0) {
            return this.finish(
                data,
                'skipped',
                OWNER_REPORT_DELIVERY_REASONS.noRecipients,
                [],
                null,
            );
        }

        const report = await this.source.get(data, false, now);
        const rendered = await this.pdf.render(
            report,
            settings.calendar.timeZone,
        );
        const { bitrix, PortalModel } = await this.pbx.init(data.domain);
        // Папка из настройки; пусто — «AI-аналитика / Отчёт собственнику»
        // в группе задач ОП; не нашлась — хранилище приложения.
        const folderId =
            settings.ownerReport.diskFolderId ??
            (await this.folders.resolve(data.domain, bitrix, PortalModel));
        const upload = await new CallReportWeeklyDeliveryService().upload(
            bitrix,
            rendered.filename,
            rendered.buffer,
            folderId,
        );
        const dryRun = settings.ownerReport.dryRun && explicit.length === 0;
        if (dryRun)
            return this.finish(data, 'dry_run', null, [], upload.fileUrl);

        const message = buildOwnerReportMessage({
            report,
            fileUrl: upload.fileUrl,
        });
        const delivered: number[] = [];
        for (const userId of recipients) {
            try {
                await bitrix.message.add({
                    DIALOG_ID: String(userId),
                    MESSAGE: message,
                });
                delivered.push(userId);
            } catch (error) {
                this.logger.warn(
                    `Отчёт собственнику ${data.domain}: сообщение ${userId} не доставлено — ${(error as Error).message}`,
                );
            }
        }
        return delivered.length > 0
            ? this.finish(data, 'sent', null, delivered, upload.fileUrl)
            : this.finish(
                  data,
                  'failed',
                  OWNER_REPORT_DELIVERY_REASONS.notDelivered,
                  [],
                  upload.fileUrl,
              );
    }

    private skipReason(
        settings: AiAnalyticsPortalSettings,
        explicit: boolean,
    ): OwnerReportDeliveryResult['reason'] {
        if (!settings.enabled) return OWNER_REPORT_DELIVERY_REASONS.aiDisabled;
        if (!explicit && !settings.ownerReport.enabled) {
            return OWNER_REPORT_DELIVERY_REASONS.disabled;
        }
        return null;
    }

    private finish(
        data: AiOwnerReportDeliveryJobData,
        status: OwnerReportDeliveryResult['status'],
        reason: OwnerReportDeliveryResult['reason'],
        delivered: number[],
        fileUrl: string | null,
    ): OwnerReportDeliveryResult {
        const summary =
            `Отчёт собственнику ${data.domain} ${data.kind} ${data.periodKey}: ${status}` +
            (reason ? ` (${reason})` : '') +
            (delivered.length ? `, доставлено ${delivered.length}` : '') +
            (fileUrl ? `, файл ${fileUrl}` : '');
        if (status === 'skipped') this.logger.log(summary);
        else this.logger.log(summary, { telegram: true });
        return {
            kind: data.kind,
            periodKey: data.periodKey,
            status,
            reason,
            delivered,
            fileUrl,
        };
    }
}
