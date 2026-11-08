import { CabinetPasswordLinkPurpose } from '../domain/cabinet.constants';

export interface PasswordLinkMail {
    to: string;
    name: string;
    url: string;
    purpose: CabinetPasswordLinkPurpose;
    expiresAt: Date;
}

/**
 * Порт отправки писем кабинета. Сервисы зависят от него, а не от SMTP:
 * без почтового сервера письма «не уходят» (false), и вызывающий решает,
 * что делать — админка показывает ссылку для ручной передачи.
 */
export abstract class CabinetMailer {
    /** @returns true — письмо принято почтовым сервером */
    abstract sendPasswordLink(mail: PasswordLinkMail): Promise<boolean>;
}
