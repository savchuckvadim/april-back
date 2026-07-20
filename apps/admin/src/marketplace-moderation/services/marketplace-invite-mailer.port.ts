/** Что нужно письму с кодом подключения */
export interface InviteMailPayload {
    /** Открытый код — в письмо он попадает единственный раз */
    code: string;
    email: string;
    organization?: string;
    expiresAt?: Date;
}

/**
 * Порт отправки письма с кодом подключения (abstract class как DI-токен —
 * тот же приём, что у репозиториев модуля).
 *
 * Сервис выпуска зависит от этой абстракции, а не от реализации: рендер
 * React Email-шаблона (.tsx) и MailService живут в
 * MarketplaceInviteMailerService и в сервис выпуска не протекают.
 */
export abstract class MarketplaceInviteMailer {
    /** true — письмо отправлено; false — любой сбой отправки/рендера */
    abstract sendInvite(payload: InviteMailPayload): Promise<boolean>;
}
