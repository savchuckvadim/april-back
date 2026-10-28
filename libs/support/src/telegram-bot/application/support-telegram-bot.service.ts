import { Injectable, Logger } from '@nestjs/common';
import { SupportAssistantService } from '../../assistant/application/support-assistant.service';
import {
    formatAssistantHelp,
    formatDialogsTelegram,
    formatDraftTelegram,
    formatLookupMiss,
} from '../../assistant/domain/support-assistant.format';
import { SupportDraft } from '../../assistant/domain/support-assistant.types';
import { SupportDraftStore } from '../../assistant/infrastructure/support-draft.store';
import { escapeHtml } from '../../monitor/domain/support-signal.formatter';
import { SupportTelegramNotifier } from '../../monitor/infrastructure/support-telegram.notifier';
import {
    parseSupportCallback,
    parseSupportCommand,
} from '../domain/support-telegram.commands';
import { buildDraftKeyboard } from '../domain/support-telegram.keyboard';
import {
    SupportTelegramCallbackQuery,
    SupportTelegramMessage,
    SupportTelegramUpdate,
    SupportTelegramUser,
    telegramUserName,
} from '../domain/support-telegram.update';

/** Членство в чате поддержки для личных сообщений — проверяем не чаще раза в 10 минут. */
const MEMBERSHIP_TTL_MS = 10 * 60 * 1000;

/**
 * Telegram-вход к ИИ-помощнику (решение владельца 28.10.2026: бот в
 * apps/bot на подписке не держим, OpenClaw не нужен). Команды принимаются
 * из чата поддержки и в личке от его участников; черновик уходит клиенту
 * только по кнопке «Отправить клиенту» — это и есть «да» человека.
 */
@Injectable()
export class SupportTelegramBotService {
    private readonly logger = new Logger(SupportTelegramBotService.name);
    private readonly members = new Map<number, number>();

    constructor(
        private readonly assistant: SupportAssistantService,
        private readonly telegram: SupportTelegramNotifier,
        private readonly drafts: SupportDraftStore,
    ) {}

    async handle(update: SupportTelegramUpdate): Promise<void> {
        if (update.callback_query) {
            await this.handleCallback(update.callback_query);
            return;
        }
        if (update.message) {
            await this.handleMessage(update.message);
        }
    }

    private async handleMessage(
        message: SupportTelegramMessage,
    ): Promise<void> {
        const chatId = message.chat.id;
        if (!(await this.allowed(chatId, message.from))) {
            this.logger.debug(
                `Telegram-бот поддержки: сообщение из чужого чата ${chatId} пропущено`,
            );
            return;
        }
        try {
            const text = message.text?.trim() ?? '';
            if (message.reply_to_message && text) {
                const draftId = await this.drafts.draftIdOfMessage(
                    chatId,
                    message.reply_to_message.message_id,
                );
                if (draftId) {
                    await this.postDraft(
                        chatId,
                        await this.assistant.revise(draftId, text),
                        '✏️ Черновик поправлен.',
                    );
                    return;
                }
            }
            const command = parseSupportCommand(text);
            if (!command) return;
            switch (command.kind) {
                case 'help':
                    await this.telegram.sendTo(chatId, formatAssistantHelp());
                    return;
                case 'dialogs': {
                    const list = await this.assistant.listDialogs();
                    await this.telegram.sendTo(
                        chatId,
                        formatDialogsTelegram(list.dialogs),
                    );
                    return;
                }
                case 'analyze':
                    await this.analyze(chatId, command.query);
                    return;
            }
        } catch (error) {
            await this.report(chatId, error);
        }
    }

    private async analyze(chatId: number, query: string): Promise<void> {
        const lookup = await this.assistant.findDialog(query);
        if (!lookup.dialog) {
            await this.telegram.sendTo(chatId, formatLookupMiss(query, lookup));
            return;
        }
        await this.telegram.sendTo(
            chatId,
            `⏳ Разбираю диалог с ${escapeHtml(lookup.dialog.clientName)}…`,
        );
        const draft = await this.assistant.analyze(
            lookup.dialog.chatId,
            lookup.lineDomain,
        );
        await this.postDraft(chatId, draft);
    }

    /** Черновик с кнопками; сообщение привязывается к черновику для правок ответом. */
    private async postDraft(
        chatId: number,
        draft: SupportDraft,
        prefix?: string,
    ): Promise<void> {
        const html = prefix
            ? `${prefix}\n${formatDraftTelegram(draft)}`
            : formatDraftTelegram(draft);
        const messageId = await this.telegram.sendTo(chatId, html, {
            replyMarkup: buildDraftKeyboard(draft),
        });
        if (messageId) {
            await this.drafts.bindMessage(chatId, messageId, draft.id);
        }
    }

    private async handleCallback(
        query: SupportTelegramCallbackQuery,
    ): Promise<void> {
        const callback = parseSupportCallback(query.data);
        const chatId = query.message?.chat.id;
        const messageId = query.message?.message_id;
        if (!callback || chatId === undefined || messageId === undefined) {
            await this.telegram.answerCallback(query.id);
            return;
        }
        if (!(await this.allowed(chatId, query.from))) {
            await this.telegram.answerCallback(query.id, 'Нет доступа');
            return;
        }
        const who = telegramUserName(query.from);
        try {
            switch (callback.action) {
                case 'send':
                    await this.assistant.send(
                        callback.draftId,
                        `${who} (кнопка в Telegram)`,
                    );
                    await this.telegram.answerCallback(
                        query.id,
                        'Ответ отправлен клиенту',
                    );
                    await this.telegram.clearKeyboard(chatId, messageId);
                    return;
                case 'task': {
                    const task = await this.assistant.createTask(
                        callback.draftId,
                    );
                    await this.telegram.answerCallback(
                        query.id,
                        'Задача поставлена',
                    );
                    await this.telegram.sendTo(
                        chatId,
                        `🛠 Задача №${task.taskId} поставлена (${escapeHtml(who)}): ` +
                            `<a href="${escapeHtml(task.url)}">открыть</a>`,
                    );
                    return;
                }
                case 'discard':
                    await this.assistant.discard(callback.draftId);
                    await this.telegram.answerCallback(
                        query.id,
                        'Черновик убран',
                    );
                    await this.telegram.clearKeyboard(chatId, messageId);
                    return;
            }
        } catch (error) {
            await this.telegram.answerCallback(query.id, 'Не получилось');
            await this.report(chatId, error);
        }
    }

    /** Чат поддержки — всегда; личка — только участникам чата поддержки. */
    private async allowed(
        chatId: number,
        from: SupportTelegramUser | undefined,
    ): Promise<boolean> {
        if (String(chatId) === this.telegram.supportChatId()) return true;
        if (chatId <= 0 || !from || from.is_bot) return false;
        const until = this.members.get(from.id);
        if (until && until > Date.now()) return true;
        const member = await this.telegram.isChatMember(from.id);
        if (member) this.members.set(from.id, Date.now() + MEMBERSHIP_TTL_MS);
        return member;
    }

    private async report(chatId: number, error: unknown): Promise<void> {
        const message = (error as Error).message ?? String(error);
        this.logger.warn(`Telegram-бот поддержки: ${message}`);
        await this.telegram.sendTo(
            chatId,
            `⚠️ Не получилось: ${escapeHtml(message)}`,
        );
    }
}
