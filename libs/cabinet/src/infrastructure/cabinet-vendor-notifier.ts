import { Injectable, Logger, Optional } from '@nestjs/common';
import { TelegramService } from '@lib/telegram';

/**
 * Уведомления вендору (Telegram-чат администраторов April): заявка на
 * доступ в кабинет из фрейма, передача прав владельца. Best-effort:
 * сбой Telegram не роняет действие клиента — факт остаётся в журнале.
 */
@Injectable()
export class CabinetVendorNotifier {
    private readonly logger = new Logger(CabinetVendorNotifier.name);

    constructor(@Optional() private readonly telegram?: TelegramService) {}

    async notify(lines: readonly string[]): Promise<void> {
        if (!this.telegram) return;
        try {
            await this.telegram.sendMessage(lines.join('\n'));
        } catch (error) {
            this.logger.warn(
                `Уведомление вендору не отправлено: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
}
