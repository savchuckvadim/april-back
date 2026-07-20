import { Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/components';
import { MailService } from '@lib/mail';
import { PortalInviteTemplate } from '@lib/mail/templates/portal-invite.template';
import {
    InviteMailPayload,
    MarketplaceInviteMailer,
} from './marketplace-invite-mailer.port';

/**
 * Отправка письма с кодом подключения портала (реализация порта
 * MarketplaceInviteMailer).
 *
 * Здесь живёт рендер React Email-шаблона и знание о том, что MailService
 * ГЛОТАЕТ ошибки отправки (возвращает undefined). Наружу отдаём честный
 * boolean — «письмо ушло / не ушло», по нему сервис решает статус кода.
 */
@Injectable()
export class MarketplaceInviteMailerService implements MarketplaceInviteMailer {
    private readonly logger = new Logger(MarketplaceInviteMailerService.name);

    constructor(private readonly mailService: MailService) {}

    async sendInvite(payload: InviteMailPayload): Promise<boolean> {
        try {
            const html = await render(
                PortalInviteTemplate({
                    code: payload.code,
                    organization: payload.organization,
                    expiresAtLabel: this.formatExpiresAt(payload.expiresAt),
                }),
            );

            // sendEmail не бросает исключений: при сбое SMTP вернёт undefined
            const result = await this.mailService.sendEmail({
                subject:
                    'Код подключения портала к сервису April («Менеджер Гарант»)',
                html,
                to: [payload.email],
                context: { organization: payload.organization },
            });

            return result !== undefined;
        } catch (error) {
            this.logger.warn(
                `Письмо с кодом подключения не отправлено (${payload.email}): ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }

    /** Человекочитаемый срок действия для письма (ru-RU) */
    private formatExpiresAt(expiresAt?: Date): string | undefined {
        if (!expiresAt) {
            return undefined;
        }
        return expiresAt.toLocaleString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
    }
}
