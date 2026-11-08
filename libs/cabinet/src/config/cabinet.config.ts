import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CABINET_DEFAULTS, CABINET_ENV } from '../domain/cabinet.constants';

/**
 * Настройки кабинета из окружения приложения с умолчаниями. Читаются на
 * каждый вызов (дёшево) — правка env подхватывается перезапуском без кода.
 */
@Injectable()
export class CabinetConfig {
    constructor(private readonly config: ConfigService) {}

    accessTtl(): string {
        return this.text(CABINET_ENV.accessTtl) || CABINET_DEFAULTS.accessTtl;
    }

    refreshTtlDays(): number {
        const days = Number(this.text(CABINET_ENV.refreshTtlDays));
        return Number.isFinite(days) && days > 0 && days <= 365
            ? days
            : CABINET_DEFAULTS.refreshTtlDays;
    }

    /** Адрес сайта кабинета без завершающего слэша. */
    siteUrl(): string {
        return (
            this.text(CABINET_ENV.siteUrl) || CABINET_DEFAULTS.siteUrl
        ).replace(/\/+$/, '');
    }

    /** Домен refresh-cookie; null — без домена (локальная разработка). */
    cookieDomain(): string | null {
        return this.text(CABINET_ENV.cookieDomain) || null;
    }

    /** Cookie только по https — везде, кроме локального http. */
    cookieSecure(): boolean {
        return this.config.get<string>('NODE_ENV') === 'production'
            ? true
            : this.siteUrl().startsWith('https://');
    }

    telegramWebhookUrl(): string {
        return this.text(CABINET_ENV.telegramWebhookUrl);
    }

    private text(key: string): string {
        return (this.config.get<string>(key) ?? '').trim();
    }
}
