import { CabinetPasswordLinkPurpose } from '../domain/cabinet.constants';
import type { SmtpErrorInfo } from './smtp-error.explain';

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
/** Итог тестового письма: error — причина по-русски или ответ SMTP. */
export interface MailTestResult {
    ok: boolean;
    error: string | null;
    /** Поля ошибки SMTP (код, шаг, ответ сервера) — для разбора причины. */
    smtp?: SmtpErrorInfo;
}

export abstract class CabinetMailer {
    /** @returns true — письмо принято почтовым сервером */
    abstract sendPasswordLink(mail: PasswordLinkMail): Promise<boolean>;

    /** Проверка почты из админки: короткое письмо, причина отказа — наружу. */
    abstract sendTest(to: string): Promise<MailTestResult>;
}
