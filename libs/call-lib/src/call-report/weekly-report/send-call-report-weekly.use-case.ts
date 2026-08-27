import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { WeeklyReportDeliveryMode } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
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
     * @param options период отчёта (по умолчанию — последние 7 дней) и
     * ручные переопределения получателей/способа доставки: нужны для
     * теста «отправить отчёт себе», не трогая настройки портала.
     */
    async execute(
        domain: string,
        options?: {
            from?: Date;
            to?: Date;
            /** Кому отправить вместо получателей из настроек портала. */
            recipients?: number[];
            /** Способ доставки вместо заданного в настройках. */
            delivery?: WeeklyReportDeliveryMode;
        },
    ): Promise<CallReportWeeklyResult> {
        const to = options?.to ?? new Date();
        const from =
            options?.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

        const dataset = await this.data.collect(domain, from, to);
        const portalSettings = await this.settings.getByDomain(domain);
        const recipients = options?.recipients?.length
            ? options.recipients
            : (portalSettings?.weeklyReportRecipients ?? []);
        const deliveryMode =
            options?.delivery ?? portalSettings?.weeklyReportDelivery ?? 'chat';
        const folderId = portalSettings?.weeklyReportFolderId ?? null;
        if (options?.recipients?.length) {
            this.logger.log(
                `Недельный отчёт ${domain}: ручная отправка получателям ` +
                    `[${options.recipients.join(', ')}] способом ${deliveryMode}`,
            );
        }

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
                delivery: null,
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

        const message = this.buildMessage(
            dataset.rows.length,
            from,
            to,
            uploaded.fileUrl,
        );
        const notifiedUserIds = recipients.length
            ? await this.deliver(bitrix, deliveryMode, recipients, {
                  fileName,
                  content,
                  message,
                  uploaded,
                  period: { from, to },
              })
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
            delivery: notifiedUserIds.length ? deliveryMode : null,
        };
    }

    /**
     * Доставка получателям выбранным способом:
     * - chat (по умолчанию) — файл сообщением в личный чат каждому;
     * - task — одна задача с прикреплённым файлом с Диска;
     * - notify — уведомление со ссылкой на файл.
     *
     * Если основной способ не сработал (например, чат недоступен), файл
     * не теряется: уходит уведомление со ссылкой — получатель узнает об
     * отчёте в любом случае.
     */
    private async deliver(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        mode: WeeklyReportDeliveryMode,
        recipients: number[],
        payload: {
            fileName: string;
            content: Buffer;
            message: string;
            uploaded: { fileId: number | null; fileUrl: string | null };
            period: { from: Date; to: Date };
        },
    ): Promise<number[]> {
        if (mode === 'chat') {
            const delivered = await this.delivery.sendToChat(
                bitrix,
                recipients,
                payload.fileName,
                payload.content,
                payload.message,
            );
            const failed = recipients.filter(id => !delivered.includes(id));
            if (!failed.length) return delivered;
            this.logger.warn(
                `Недельный отчёт: файл в чат не ушёл ${failed.length} получателям — ` +
                    `отправляю им уведомление со ссылкой`,
            );
            const fallback = await this.delivery.notify(
                bitrix,
                failed,
                payload.message,
            );
            return [...delivered, ...fallback];
        }

        if (mode === 'task') {
            const period = `${this.formatDate(payload.period.from)} — ${this.formatDate(payload.period.to)}`;
            const taskId = await this.delivery.createTask(
                bitrix,
                recipients,
                `Недельный отчёт по звонкам (${period})`,
                payload.message,
                payload.uploaded.fileId,
            );
            if (taskId) return recipients;
            this.logger.warn(
                'Недельный отчёт: задача не создана — отправляю уведомления',
            );
            return this.delivery.notify(bitrix, recipients, payload.message);
        }

        return this.delivery.notify(bitrix, recipients, payload.message);
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
