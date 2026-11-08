import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { render } from '@react-email/components';
import { CabinetPasswordLinkTemplate } from '@lib/mail/templates/cabinet-password-link.template';
import { CabinetMailer, PasswordLinkMail } from './cabinet-mailer.port';

/** Отправитель писем по умолчанию — если в env нет SMTP_FROM. */
const DEFAULT_FROM = 'manager@april-app.ru';

/**
 * Письма кабинета через SMTP приложения (`MailerService` из
 * @nestjs-modules/mailer). Транспорт даёт приложение: в admin — модуль
 * модерации маркетплейса, в pbx — {@link CabinetMailTransportModule}.
 *
 * Нет транспорта или не задан MAIL_HOST — письмо «не ушло» (false), без
 * исключения: почтового сервера у April пока нет (07.11.2026), и это
 * штатное состояние, а не авария.
 */
@Injectable()
export class CabinetMailerService extends CabinetMailer {
    private readonly logger = new Logger(CabinetMailerService.name);

    constructor(
        private readonly config: ConfigService,
        @Optional() private readonly mailer?: MailerService,
    ) {
        super();
    }

    async sendPasswordLink(mail: PasswordLinkMail): Promise<boolean> {
        if (!this.mailer || !this.isConfigured()) {
            this.logger.warn(
                `Почта не настроена (MAIL_HOST) — письмо со ссылкой на пароль для ${mail.to} не отправлено`,
            );
            return false;
        }
        try {
            const html = await render(
                CabinetPasswordLinkTemplate({
                    name: mail.name,
                    url: mail.url,
                    purpose: mail.purpose,
                    expiresLabel: formatExpires(mail.expiresAt),
                }),
            );
            await this.mailer.sendMail({
                to: mail.to,
                from: `"April" <${this.config.get<string>('SMTP_FROM') || DEFAULT_FROM}>`,
                subject:
                    mail.purpose === 'setup'
                        ? 'Доступ в кабинет April'
                        : 'Восстановление пароля к кабинету April',
                html,
            });
            return true;
        } catch (error) {
            this.logger.warn(
                `Письмо со ссылкой на пароль для ${mail.to} не отправлено: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return false;
        }
    }

    private isConfigured(): boolean {
        return Boolean((this.config.get<string>('MAIL_HOST') ?? '').trim());
    }
}

function formatExpires(date: Date): string {
    const label = new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
    }).format(date);
    return `до ${label} (МСК)`;
}
