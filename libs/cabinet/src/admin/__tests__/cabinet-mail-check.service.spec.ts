import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CabinetMailer } from '../../infrastructure/cabinet-mailer.port';
import {
    SmtpNetworkProbe,
    SmtpPortProbe,
} from '../../infrastructure/smtp-network.probe';
import { CabinetMailCheckService } from '../cabinet-mail-check.service';

const MAIL_ENV: Record<string, string> = {
    MAIL_HOST: 'smtp.mail.ru',
    MAIL_PORT: '465',
    MAIL_LOGIN: 'april-app@mail.ru',
    MAIL_PASSWORD: 'secret',
    SMTP_FROM: 'april-app@mail.ru',
};

function setup(env: Record<string, string> = MAIL_ENV) {
    const config = { get: (key: string) => env[key] };
    const mailer = {
        sendTest: jest.fn().mockResolvedValue({ ok: true, error: null }),
    };
    const probe = {
        resolve: jest.fn().mockResolvedValue(['94.100.180.160']),
        probePort: jest.fn<Promise<SmtpPortProbe>, [string, number]>(
            (_host, port) =>
                Promise.resolve({
                    port,
                    state: port === 587 ? 'open' : 'timeout',
                    detail: null,
                }),
        ),
    };
    const service = new CabinetMailCheckService(
        config as unknown as ConfigService,
        mailer as unknown as CabinetMailer,
        probe as unknown as SmtpNetworkProbe,
    );
    return { service, mailer, probe };
}

const connectionTimeout = {
    ok: false,
    error: 'Connection timeout',
    smtp: {
        message: 'Connection timeout',
        code: 'ETIMEDOUT',
        command: 'CONN',
        responseCode: null,
    },
};

describe('CabinetMailCheckService.status', () => {
    it('настройка без пароля; отправитель совпадает с ящиком — замечаний нет', () => {
        expect(setup().service.status()).toEqual({
            configured: true,
            host: 'smtp.mail.ru',
            port: 465,
            secure: true,
            login: 'april-app@mail.ru',
            passwordSet: true,
            from: 'april-app@mail.ru',
            warnings: [],
        });
    });

    it('отправитель по умолчанию не совпадает с ящиком — подсказка SMTP_FROM', () => {
        const { service } = setup({ ...MAIL_ENV, SMTP_FROM: '' });
        expect(service.status().warnings).toEqual([
            expect.stringContaining('SMTP_FROM=april-app@mail.ru'),
        ]);
    });

    it('без MAIL_HOST — не настроена', () => {
        const status = setup({}).service.status();
        expect(status.configured).toBe(false);
        expect(status.warnings[0]).toContain('MAIL_HOST не задан');
    });
});

describe('CabinetMailCheckService.test', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('письмо ушло — без диагностики', async () => {
        const { service, mailer, probe } = setup();
        await expect(service.test(' me@example.ru ')).resolves.toEqual({
            ok: true,
            message: expect.stringContaining('me@example.ru') as unknown,
            details: [],
        });
        expect(mailer.sendTest).toHaveBeenCalledWith('me@example.ru');
        expect(probe.probePort).not.toHaveBeenCalled();
    });

    it('нет соединения — проба DNS и портов, совет сменить порт, запись в журнал', async () => {
        const { service, mailer, probe } = setup();
        mailer.sendTest.mockResolvedValue(connectionTimeout);
        const result = await service.test('me@example.ru');

        expect(result.ok).toBe(false);
        expect(result.message).toContain(
            'не может подключиться к smtp.mail.ru:465',
        );
        expect(probe.probePort.mock.calls.map(([, port]) => port)).toEqual([
            465, 587,
        ]);
        expect(result.details).toEqual([
            'smtp.mail.ru → 94.100.180.160',
            'порт 465: нет ответа (закрыт или режется по пути)',
            'порт 587: открыт',
            expect.stringContaining('MAIL_PORT=587') as unknown,
        ]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('smtp.mail.ru:465 (connect, ETIMEDOUT)'),
        );
    });

    it('все порты закрыты — совет про хостинг', async () => {
        const { service, mailer, probe } = setup();
        mailer.sendTest.mockResolvedValue(connectionTimeout);
        probe.probePort.mockImplementation((_host: string, port: number) =>
            Promise.resolve({ port, state: 'timeout', detail: null }),
        );
        const result = await service.test('me@example.ru');
        expect(result.details.at(-1)).toContain('попросите хостинг');
    });

    it('неверный пароль — причина без сетевой пробы', async () => {
        const { service, mailer, probe } = setup();
        mailer.sendTest.mockResolvedValue({
            ok: false,
            error: 'Invalid login: 535 Authentication failed',
            smtp: {
                message: 'Invalid login: 535 Authentication failed',
                code: 'EAUTH',
                command: 'AUTH PLAIN',
                responseCode: 535,
            },
        });
        const result = await service.test('me@example.ru');
        expect(result.message).toContain('пароль для внешнего приложения');
        expect(result.details).toEqual([]);
        expect(probe.probePort).not.toHaveBeenCalled();
    });

    it('почта не настроена — письмо не отправляем', async () => {
        const { service, mailer } = setup({});
        const result = await service.test('me@example.ru');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('Почта не настроена');
        expect(mailer.sendTest).not.toHaveBeenCalled();
    });
});
