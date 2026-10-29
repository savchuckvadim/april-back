import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { EgressProxyService } from '@lib/egress-proxy';
import { TelegramSendMessageDto } from './telegram.dto';
import {
    TelegramSendWindow,
    toTelegramMarkdownText,
} from './telegram-message.util';

/** Хост Bot API — он должен быть в списке хостов исходящего прокси. */
export const TELEGRAM_API_HOST = 'api.telegram.org';

/**
 * Единственный отправитель тревог в Telegram: логгер-транспорт, фильтр
 * исключений, Битрикс-клиент, публичная ручка /telegram для фронтов. Ходит
 * прямо в Bot API через исходящий прокси (@lib/egress-proxy): с российских
 * серверов api.telegram.org не отвечает, а реле на april-dev, через которое
 * раньше слал прод, больше нет (29.10.2026). WITH_TELEGRAM=true — отправка
 * включена (нужны TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID), иначе
 * выключена: сообщения отбрасываются с одним предупреждением в лог.
 *
 * Инварианты:
 *  - отправка НИКОГДА не роняет вызвавший поток: ошибка Telegram API — это
 *    потерянная тревога, а не сломанная бизнес-операция;
 *  - троттлинг-окно на все методы разом (TelegramSendWindow): защита и
 *    публичной ручки, и логгер-транспорта, и внутренних вызовов.
 */
@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);
    private readonly sendWindow = new TelegramSendWindow();
    private readonly appName: string;
    private readonly adminChatId: string | null;
    /** Адрес sendMessage Bot API; null — отправка выключена или не настроена. */
    private readonly url: string | null;
    private readonly disabledReason: string | null;
    private disabledWarned = false;
    private routeWarned = false;

    constructor(
        private readonly httpService: HttpService,
        configService: ConfigService,
        private readonly egress: EgressProxyService,
    ) {
        const read = (key: string): string =>
            (configService.get<string>(key) ?? '').trim();
        this.appName = read('APP_NAME') || 'Monorepo';
        const token = read('TELEGRAM_BOT_TOKEN');
        const chatId = read('TELEGRAM_ADMIN_CHAT_ID');
        this.disabledReason =
            read('WITH_TELEGRAM') !== 'true'
                ? 'WITH_TELEGRAM не равен true'
                : !token
                  ? 'нет TELEGRAM_BOT_TOKEN'
                  : !chatId
                    ? 'нет TELEGRAM_ADMIN_CHAT_ID'
                    : null;
        this.adminChatId = this.disabledReason ? null : chatId;
        this.url = this.disabledReason
            ? null
            : `https://${TELEGRAM_API_HOST}/bot${token}/sendMessage`;
    }

    /** Отправка включена и настроена. */
    get enabled(): boolean {
        return this.url !== null;
    }

    /** Тревога от фронта или другого приложения (ручка /telegram): маркер приложения едет как есть. */
    public async sendPublicMessage(
        dto: TelegramSendMessageDto,
    ): Promise<string> {
        const text = `\n💥 App:  ${dto.app}\n🌍 Domain:   ${dto.domain}\n🧭 UserId: ${dto.userId}\n\n ⚠️ Text:  ${dto.text}`;
        const cleanText = toTelegramMarkdownText(text);
        await this.post(cleanText);
        return cleanText;
    }

    async sendMessage(message: string): Promise<void> {
        await this.post(
            `NEST ${this.appName}: ${toTelegramMarkdownText(message)}`,
        );
    }

    async sendMessageAdminError(message: string): Promise<void> {
        await this.post(
            `NEST ${this.appName} ADMIN ERROR: ${toTelegramMarkdownText(message)}`,
        );
    }

    /**
     * Единая точка отправки: выключатель, троттлинг, маршрут через прокси и
     * гарантия «не уронить вызвавшего». Все send-методы обязаны ходить
     * через неё — иначе лимит обходится.
     */
    private async post(text: string): Promise<void> {
        if (!this.url || !this.adminChatId) {
            if (!this.disabledWarned) {
                this.disabledWarned = true;
                this.logger.warn(
                    `Telegram выключен (${this.disabledReason}) — сообщения не отправляются`,
                );
            }
            return;
        }
        if (!this.sendWindow.tryConsume()) {
            // Не error: это штатная защита канала, а не сбой.
            this.logger.warn(
                'Telegram: лимит сообщений в минуту исчерпан — отправка пропущена',
            );
            return;
        }
        const route = this.egress.route(this.url);
        this.warnIfDirect(route.viaProxy);
        const payload = {
            chat_id: this.adminChatId,
            text,
            parse_mode: 'Markdown',
        };
        try {
            await firstValueFrom(
                route.viaProxy
                    ? this.httpService.post(route.url, payload, {
                          headers: { ...route.headers },
                      })
                    : this.httpService.post(this.url, payload),
            );
        } catch (error) {
            // console, не this.logger.error: у логгера есть Telegram-транспорт,
            // и лог об ошибке отправки в Telegram зациклил бы отправку.
            console.error('Telegram error:', error);
        }
    }

    /**
     * Один раз за процесс: Bot API идёт мимо прокси. С российского сервера
     * такие сообщения пропадут — почти наверняка забыли api.telegram.org в
     * списке хостов прокси (настройки приложения в админке или env).
     */
    private warnIfDirect(viaProxy: boolean): void {
        if (viaProxy || this.routeWarned) return;
        this.routeWarned = true;
        const status = this.egress.status();
        this.logger.warn(
            status.enabled
                ? `Telegram идёт напрямую: ${TELEGRAM_API_HOST} нет в списке хостов прокси (${status.hosts.join(', ')})`
                : 'Telegram идёт напрямую: исходящий прокси не настроен',
        );
    }
}
