import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule, MailerOptions } from '@nestjs-modules/mailer';
import { getMailerConfig } from '@lib/core/config/mail/mailer.config';

/**
 * SMTP-транспорт писем кабинета для приложений, где его ещё нет (pbx).
 *
 * Почему не MailModule из @lib/mail: тот глобальный и открывает публичный
 * MailController с Bull-процессором — в API pbx (Swagger, роуты) это лишнее
 * (правило ai/rules/app-api-surface.md). Здесь — только транспорт.
 *
 * Без MAIL_HOST транспорт «пустой» (jsonTransport — письма никуда не
 * уходят), а не падение старта: почтового сервера пока нет, кабинет
 * работает со ссылками, которые админ передаёт вручную.
 *
 * В apps/admin НЕ подключать: транспорт там уже даёт модуль модерации
 * маркетплейса (MailerModule глобальный — второй экземпляр не нужен).
 */
@Module({})
export class CabinetMailTransportModule {
    static forApp(): DynamicModule {
        return {
            module: CabinetMailTransportModule,
            imports: [
                MailerModule.forRootAsync({
                    imports: [ConfigModule],
                    inject: [ConfigService],
                    useFactory: (config: ConfigService): MailerOptions =>
                        (config.get<string>('MAIL_HOST') ?? '').trim()
                            ? getMailerConfig(config)
                            : { transport: { jsonTransport: true } },
                }),
            ],
        };
    }
}
