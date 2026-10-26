import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { BitrixService } from '@lib/bitrix';
import { PBXService } from '@lib/pbx';
import { LogQueryService } from '@lib/logger/query';
import { normalizeSupportDomain } from '../../monitor/application/support-monitor-options';
import { SupportMonitorSettingsService } from '../../monitor/application/support-monitor-settings.service';
import {
    SupportDialogReport,
    toDialogReport,
} from '../../monitor/application/support-monitor.report';
import { SupportLineReader } from '../../monitor/infrastructure/support-line.reader';
import { SupportTelegramNotifier } from '../../monitor/infrastructure/support-telegram.notifier';
import {
    SupportChatView,
    SupportClientErrors,
    SupportReplyResult,
    SupportTaskInput,
    SupportTaskResult,
} from '../domain/support-desk.types';
import {
    buildSupportTaskDescription,
    formatReplyJournal,
    supportTaskUrl,
} from '../domain/support-desk.text';
import { SupportChatReader } from '../infrastructure/support-chat.reader';
import { SupportReplySender } from '../infrastructure/support-reply.sender';

export interface SupportDialogsList {
    domain: string;
    dialogs: SupportDialogReport[];
    warnings: string[];
}

/**
 * Стойка поддержки для техспециалиста и ИИ (Support API): открытые
 * диалоги, переписка, ответ клиенту после подтверждения человека, задача
 * на исправление.
 *
 * Портал линии — переданный явно или первый, где включён мониторинг
 * поддержки. Инстансы Битрикса — per-call (CLAUDE.md).
 */
@Injectable()
export class SupportDeskService {
    private readonly logger = new Logger(SupportDeskService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly settings: SupportMonitorSettingsService,
        private readonly telegram: SupportTelegramNotifier,
        private readonly logs: LogQueryService,
    ) {}

    /**
     * Ошибки наших приложений по порталу клиента из журналов ClickHouse:
     * сводка с выводами и последние ошибки. Портал — из диалога
     * (`clientPortal`), не портал линии.
     */
    async clientErrors(
        clientDomain: string,
        hours: number,
    ): Promise<SupportClientErrors> {
        const domain = normalizeSupportDomain(clientDomain);
        if (!domain) {
            throw new BadRequestException('Укажите портал клиента');
        }
        const [summary, recent] = await Promise.all([
            this.logs.summary({ hours, domain }),
            this.logs.rows({ hours, domain, level: 'error' }, 20),
        ]);
        return { domain, summary, recent };
    }

    /** Открытые диалоги линии: кто ждёт и сколько. */
    async listDialogs(domain?: string): Promise<SupportDialogsList> {
        const lineDomain = await this.resolveLineDomain(domain);
        const options = await this.settings.resolveOptions(lineDomain);
        const now = new Date();
        const { bitrix } = await this.pbx.init(lineDomain);
        const { dialogs, warnings } = await new SupportLineReader(
            bitrix,
        ).readOpenDialogs({ lineId: options.lineId, now });
        return {
            domain: lineDomain,
            dialogs: dialogs.map(dialog =>
                toDialogReport(dialog, lineDomain, now),
            ),
            warnings,
        };
    }

    /** Переписка чата линии. */
    async readDialog(
        chatId: number,
        limit: number,
        domain?: string,
    ): Promise<SupportChatView> {
        const lineDomain = await this.resolveLineDomain(domain);
        const { bitrix } = await this.pbx.init(lineDomain);
        return new SupportChatReader(bitrix, lineDomain).read(chatId, limit);
    }

    /**
     * Ответ клиенту. Вызывается ТОЛЬКО после явного подтверждения
     * человека: `confirmedBy` — кто подтвердил, уходит в журнал и копию
     * в Telegram-чат поддержки.
     */
    async reply(
        chatId: number,
        text: string,
        confirmedBy: string,
        domain?: string,
    ): Promise<SupportReplyResult> {
        const lineDomain = await this.resolveLineDomain(domain);
        const { bitrix } = await this.pbx.init(lineDomain);
        const outcome = await new SupportReplySender(bitrix).send(chatId, text);

        this.logger.log(
            `Ответ клиенту отправлен: ${lineDomain}, чат ${chatId}, сообщение ${outcome.messageId}, подтвердил ${confirmedBy}`,
            { supportReply: { lineDomain, chatId, confirmedBy, text } },
        );
        await this.telegram.send(
            formatReplyJournal({
                lineDomain,
                chatId,
                text,
                confirmedBy,
                clientName: await this.clientNameOf(bitrix, lineDomain, chatId),
            }),
        );
        return { domain: lineDomain, chatId, ...outcome };
    }

    /** Задача на исправление на портале оповещений (april-garant). */
    async createTask(
        input: SupportTaskInput,
        domain?: string,
    ): Promise<SupportTaskResult> {
        const lineDomain = await this.resolveLineDomain(domain);
        const options = await this.settings.resolveOptions(lineDomain);
        const { bitrix } = await this.pbx.init(options.notifyDomain);
        const response = await bitrix.task.add({
            TITLE: input.title.trim(),
            DESCRIPTION: buildSupportTaskDescription({
                description: input.description,
                lineDomain,
                chatId: input.chatId,
            }),
            RESPONSIBLE_ID: input.responsibleId,
        });
        const taskId = Number(response?.result?.task?.id);
        if (!Number.isInteger(taskId) || taskId <= 0) {
            throw new Error('Битрикс не вернул номер созданной задачи');
        }
        return {
            domain: options.notifyDomain,
            taskId,
            url: supportTaskUrl(options.notifyDomain, taskId),
        };
    }

    /** Портал линии: явный или первый с включённым мониторингом. */
    private async resolveLineDomain(domain?: string): Promise<string> {
        const explicit = normalizeSupportDomain(domain);
        if (explicit) return explicit;
        const [first] = await this.settings.listEnabledDomains();
        if (!first) {
            throw new BadRequestException(
                'Портал линии поддержки не указан, и мониторинг поддержки не включён ни на одном портале',
            );
        }
        return first;
    }

    /** Имя клиента для журнала; не прочиталось — не повод не отчитаться. */
    private async clientNameOf(
        bitrix: BitrixService,
        lineDomain: string,
        chatId: number,
    ): Promise<string | null> {
        try {
            const view = await new SupportChatReader(bitrix, lineDomain).read(
                chatId,
                5,
            );
            return view.client?.name ?? null;
        } catch {
            return null;
        }
    }
}
