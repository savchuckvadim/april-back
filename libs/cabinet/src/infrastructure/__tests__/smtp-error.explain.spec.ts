import {
    classifySmtpError,
    explainSmtpFailure,
    smtpErrorInfo,
} from '../smtp-error.explain';

/** Ошибка в форме nodemailer: message + code/command/responseCode. */
const smtpError = (
    message: string,
    fields: { code?: string; command?: string; responseCode?: number } = {},
): Error => Object.assign(new Error(message), fields);

describe('smtpErrorInfo', () => {
    it('достаёт код, шаг и ответ сервера из ошибки nodemailer', () => {
        expect(
            smtpErrorInfo(
                smtpError('Invalid login: 535 Authentication failed', {
                    code: 'EAUTH',
                    command: 'AUTH PLAIN',
                    responseCode: 535,
                }),
            ),
        ).toEqual({
            message: 'Invalid login: 535 Authentication failed',
            code: 'EAUTH',
            command: 'AUTH PLAIN',
            responseCode: 535,
        });
    });

    it('не-Error — текстом, без полей', () => {
        expect(smtpErrorInfo('сломалось')).toEqual({
            message: 'сломалось',
            code: null,
            command: null,
            responseCode: null,
        });
    });
});

describe('classifySmtpError', () => {
    it.each([
        [
            'Connection timeout',
            { code: 'ETIMEDOUT', command: 'CONN' },
            'connect',
        ],
        [
            'connect ECONNREFUSED 1.2.3.4:465',
            { code: 'ECONNREFUSED' },
            'connect',
        ],
        ['getaddrinfo ENOTFOUND smtp.mial.ru', { code: 'EDNS' }, 'dns'],
        [
            'Greeting never received',
            { code: 'ETIMEDOUT', command: 'CONN' },
            'greeting',
        ],
        ['wrong version number', { code: 'ESOCKET' }, 'tls'],
        ['Invalid login: 535', { code: 'EAUTH', responseCode: 535 }, 'auth'],
        [
            'Mail command failed: 553 sender rejected',
            { code: 'EENVELOPE' },
            'sender',
        ],
        [
            'Message failed: 554 spam',
            { code: 'EMESSAGE', responseCode: 554 },
            'other',
        ],
    ])('%s → %s', (message, fields, kind) => {
        expect(
            classifySmtpError(smtpErrorInfo(smtpError(message, fields))),
        ).toBe(kind);
    });
});

describe('explainSmtpFailure', () => {
    it('обрыв соединения — про закрытый порт с адресом', () => {
        expect(
            explainSmtpFailure('connect', { host: 'smtp.mail.ru', port: 465 }),
        ).toContain('smtp.mail.ru:465');
    });

    it('логин — про пароль для внешнего приложения', () => {
        expect(
            explainSmtpFailure('auth', { host: 'smtp.mail.ru', port: 465 }),
        ).toContain('пароль для внешнего приложения');
    });
});
