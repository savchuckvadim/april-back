import { Injectable, Logger } from '@nestjs/common';
import { CabinetTelegramBindingRepository } from '../persistence/cabinet-telegram-binding.repository';
import { CabinetTelegramLinkService } from './cabinet-telegram-link.service';
import { ClientTelegramBotClient } from './client-telegram-bot.client';

/** Минимум обновления Telegram, который читает клиентский бот. */
export interface ClientTelegramUpdate {
    update_id: number;
    message?: {
        text?: string;
        chat: { id: number; type?: string };
        from?: { username?: string; first_name?: string; last_name?: string };
    };
}

const HELP =
    'Это бот April. Чтобы получать отчёты и уведомления своего портала, ' +
    'откройте кабинет April (в Битрикс24 или на сайте) → «Привязать Telegram» ' +
    'и отправьте сюда код: <code>/start КОД</code>.\n\nОтвязать чат — /stop';

/**
 * Обработка сообщений клиентскому боту: `/start <код>` — привязка, `/stop`
 * — отвязка от всех порталов, остальное — подсказка. Только личные чаты:
 * общий чат по умолчанию — путь «пустить абы кого» (решение 07.11.2026).
 */
@Injectable()
export class ClientTelegramUpdateHandler {
    private readonly logger = new Logger(ClientTelegramUpdateHandler.name);

    constructor(
        private readonly links: CabinetTelegramLinkService,
        private readonly bindings: CabinetTelegramBindingRepository,
        private readonly bot: ClientTelegramBotClient,
    ) {}

    async handle(update: ClientTelegramUpdate): Promise<void> {
        const message = update.message;
        if (!message?.chat) return;
        const chatId = BigInt(message.chat.id);
        if (message.chat.type && message.chat.type !== 'private') {
            await this.bot.sendMessage(
                chatId,
                'Привязка работает только в личном чате с ботом.',
            );
            return;
        }
        const text = (message.text ?? '').trim();
        const [command, argument] = text.split(/\s+/, 2);

        if (command === '/start' && argument) {
            const result = await this.links.consumeCode(argument, {
                chatId,
                username: message.from?.username ?? null,
                displayName: displayName(message.from),
            });
            await this.bot.sendMessage(
                chatId,
                result
                    ? `Готово: чат привязан к порталу <b>${escapeHtml(result.domain ?? '')}</b>. Сюда будут приходить отчёты и уведомления April.\n\nОтвязать — /stop`
                    : 'Код не найден или истёк. Получите новый в кабинете April → «Привязать Telegram».',
            );
            return;
        }
        if (command === '/stop') {
            const count = await this.bindings.revokeByChat(chatId);
            await this.bot.sendMessage(
                chatId,
                count > 0
                    ? `Чат отвязан (порталов: ${count}). Уведомления April сюда больше не придут.`
                    : 'Этот чат ни к одному порталу не привязан.',
            );
            return;
        }
        await this.bot.sendMessage(chatId, HELP);
    }
}

function displayName(
    from: { first_name?: string; last_name?: string } | undefined,
): string | null {
    const name = [from?.first_name, from?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
    return name || null;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
