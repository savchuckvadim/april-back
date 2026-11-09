import { Injectable, NotFoundException } from '@nestjs/common';
import { CabinetContext } from '../domain/cabinet-context';
import { requirePortal } from '../members/cabinet-membership.service';
import { CabinetTelegramBindingRepository } from '../persistence/cabinet-telegram-binding.repository';
import { ClientTelegramBotClient } from '../telegram/client-telegram-bot.client';

/** Итог проверки канала: что произошло — по-русски. */
export interface ChannelCheckResult {
    ok: boolean;
    message: string;
}

/** Частые ответы Telegram → что с этим делать. */
const TELEGRAM_REASONS: ReadonlyArray<readonly [RegExp, string]> = [
    [
        /blocked by the user/i,
        'человек заблокировал бота — пусть разблокирует и привяжет Telegram заново',
    ],
    [
        /chat not found|user is deactivated/i,
        'чат не найден — пусть человек заново привяжет Telegram',
    ],
    [
        /unauthorized|not found/i,
        'Telegram не узнал токен клиентского бота — проверьте «Настройки приложения» → «Telegram-боты»',
    ],
];

/**
 * Проверка Telegram-канала кабинета из админки: тестовое сообщение в
 * привязанный чат клиентского бота — с причиной отказа, а не только «не
 * ушло». Почта — {@link CabinetMailCheckService}.
 */
@Injectable()
export class CabinetChannelCheckService {
    constructor(
        private readonly bindings: CabinetTelegramBindingRepository,
        private readonly bot: ClientTelegramBotClient,
    ) {}

    async testTelegramBinding(
        ctx: CabinetContext,
        bindingId: string,
    ): Promise<ChannelCheckResult> {
        const portal = requirePortal(ctx);
        const row = await this.bindings.findById(bindingId);
        if (!row || row.portalId !== portal.id) {
            throw new NotFoundException('Привязка не найдена');
        }
        if (row.revokedAt) {
            return {
                ok: false,
                message:
                    'Привязка отозвана — сообщения в этот чат не отправляются.',
            };
        }
        if (!(await this.bot.isConfigured())) {
            return {
                ok: false,
                message:
                    'Токен клиентского бота не задан — «Настройки приложения» → «Telegram-боты».',
            };
        }
        const error = await this.bot.trySendMessage(
            row.chatId,
            `✅ Проверка от April: уведомления портала ${portal.domain ?? ''} приходят в этот чат.`,
        );
        if (error === null) {
            return { ok: true, message: 'Сообщение доставлено в чат.' };
        }
        const reason = TELEGRAM_REASONS.find(([pattern]) =>
            pattern.test(error),
        );
        return {
            ok: false,
            message: `Не доставлено: ${reason ? reason[1] : error}`,
        };
    }
}
