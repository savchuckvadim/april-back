/**
 * Разбор ошибок SMTP (nodemailer) по-русски: на каком шаге не вышло и что
 * с этим делать. Без сети и Nest — чистые функции.
 */

/** Ошибка отправки — поля, по которым nodemailer сообщает причину. */
export interface SmtpErrorInfo {
    message: string;
    /** ETIMEDOUT, ECONNREFUSED, EAUTH, EENVELOPE, ESOCKET, ETLS… */
    code: string | null;
    /** Шаг SMTP: CONN, AUTH PLAIN, MAIL FROM… */
    command: string | null;
    /** Код ответа сервера (535, 550…). */
    responseCode: number | null;
}

export const SMTP_FAILURE_KINDS = [
    'connect',
    'dns',
    'greeting',
    'tls',
    'auth',
    'sender',
    'other',
] as const;
export type SmtpFailureKind = (typeof SMTP_FAILURE_KINDS)[number];

const textOf = (value: unknown): string | null =>
    typeof value === 'string' && value ? value : null;

/** Достаёт поля nodemailer из любой ошибки. */
export function smtpErrorInfo(error: unknown): SmtpErrorInfo {
    if (!(error instanceof Error)) {
        return {
            message: String(error),
            code: null,
            command: null,
            responseCode: null,
        };
    }
    const fields = error as Error & Record<string, unknown>;
    return {
        message: error.message,
        code: textOf(fields.code),
        command: textOf(fields.command),
        responseCode:
            typeof fields.responseCode === 'number'
                ? fields.responseCode
                : null,
    };
}

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EDNS']);
const CONNECT_CODES = new Set([
    'ECONNREFUSED',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ECONNRESET',
]);

/** На каком шаге отправка сорвалась. */
export function classifySmtpError(info: SmtpErrorInfo): SmtpFailureKind {
    const { code, message, responseCode } = info;
    if ((code && DNS_CODES.has(code)) || /getaddrinfo/i.test(message)) {
        return 'dns';
    }
    if (/greeting never received/i.test(message)) return 'greeting';
    if (
        (code && CONNECT_CODES.has(code)) ||
        /connection timeout|connect etimedout/i.test(message) ||
        (code === 'ETIMEDOUT' && info.command === 'CONN')
    ) {
        return 'connect';
    }
    if (
        code === 'ETLS' ||
        /wrong version number|ssl routines|certificate|tls/i.test(message)
    ) {
        return 'tls';
    }
    if (code === 'EAUTH' || responseCode === 535) return 'auth';
    if (code === 'EENVELOPE' || /sender|from address/i.test(message)) {
        return 'sender';
    }
    return 'other';
}

/** Что случилось и что делать — для админки и журнала. */
export function explainSmtpFailure(
    kind: SmtpFailureKind,
    target: { host: string; port: number },
): string {
    const address = `${target.host}:${target.port}`;
    switch (kind) {
        case 'connect':
            return (
                `сервер April не может подключиться к ${address} — соединение не устанавливается. ` +
                'Чаще всего исходящий почтовый порт закрыт хостингом или файрволом сервера.'
            );
        case 'dns':
            return `адрес ${target.host} не находится (DNS) — проверьте MAIL_HOST.`;
        case 'greeting':
            return (
                `соединение с ${address} есть, но сервер не поздоровался — проверьте ` +
                'пару порт/шифрование: 465 — SSL, 587 — STARTTLS.'
            );
        case 'tls':
            return (
                `не удалось договориться о шифровании с ${address} — проверьте ` +
                'порт: 465 — SSL, 587 — STARTTLS.'
            );
        case 'auth':
            return (
                'почтовый сервер не принял логин или пароль. Для mail.ru логин — ' +
                'полный адрес ящика, пароль — «пароль для внешнего приложения» ' +
                'из настроек безопасности, а не обычный.'
            );
        case 'sender':
            return (
                'почтовый сервер отказался отправлять от этого адреса — SMTP_FROM ' +
                'должен совпадать с ящиком MAIL_LOGIN.'
            );
        case 'other':
            return 'почтовый сервер ответил ошибкой.';
    }
}
