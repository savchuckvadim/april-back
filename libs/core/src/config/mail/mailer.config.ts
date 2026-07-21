import type { MailerOptions } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

export function getMailerConfig(configService: ConfigService): MailerOptions {
    const port = Number(configService.getOrThrow<number>('MAIL_PORT'));
    return {
        transport: {
            host: configService.getOrThrow<string>('MAIL_HOST'),
            port,
            // 465 — implicit TLS; на нём secure:false вешает соединение
            // (сервер молча ждёт TLS-handshake, приветствия не шлёт)
            secure: port === 465,
            auth: {
                user: configService.getOrThrow<string>('MAIL_LOGIN'),
                pass: configService.getOrThrow<string>('MAIL_PASSWORD'),
            },
            tls: {
                rejectUnauthorized: false,
            },
            // Без таймаутов nodemailer ждёт соединения до 2 минут — HTTP-ручки,
            // отправляющие письмо синхронно (выпуск кода подключения), висят
            // дольше nginx-таймаута: клиент видит вечный pending, а сервер
            // доделывает работу в фоне (живой инцидент 2026-07-21 с
            // задублированными кодами). Почтовый сбой должен быть БЫСТРЫМ:
            // вызывающий код обрабатывает его штатно (emailSent=false).
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000,
        },
        defaults: {
            from: `"April Team" ${configService.getOrThrow<string>('MAIL_LOGIN')}`,
        },
        // template: {
        //     dir: path.resolve(process.cwd(), 'src/templates'),
        //     adapter: new PugAdapter(),
        //     options: {
        //         strict: true,
        //     },
        // },
    };
}
