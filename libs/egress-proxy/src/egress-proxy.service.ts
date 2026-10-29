import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    VENDOR_SETTINGS_READER,
    type VendorSettingsReader,
} from '@lib/vendor-settings';
import {
    mergeHeaders,
    parseEgressProxyConfig,
    routeEgress,
} from './egress-route.util';
import {
    EGRESS_PROXY_ENV,
    type EgressProxyConfig,
    type EgressProxyStatus,
    type EgressRoute,
} from './egress-proxy.types';

/** Как часто перечитывать настройки прокси: правка в админке действует в течение минуты. */
export const EGRESS_PROXY_REFRESH_MS = 60_000;

const describeConfig = (config: EgressProxyConfig | null): string =>
    config ? `${config.baseUrl} [${config.hosts.join(', ')}]` : 'выключен';

/**
 * Исходящий прокси: `route()` переписывает адрес и даёт заголовки, `fetch()` —
 * обёртка над глобальным fetch с учётом маршрута; потребители на axios
 * пользуются `route()` сами. Конфиг — настройки вендора из админки
 * (EGRESS_PROXY_URL / _TOKEN / _HOSTS), иначе те же переменные окружения;
 * без них прокси выключен — всё идёт напрямую. Снимок конфига обновляется
 * раз в минуту: `fetch()` ждёт свежий, синхронный `route()` отдаёт текущий и
 * обновляет в фоне (Telegram на axios зовёт его без await).
 */
@Injectable()
export class EgressProxyService {
    private readonly logger = new Logger(EgressProxyService.name);
    private readonly settings: VendorSettingsReader | null;
    private config: EgressProxyConfig | null;
    private expiresAt = 0;
    private refreshing: Promise<void> | null = null;

    constructor(
        configService: ConfigService,
        @Optional()
        @Inject(VENDOR_SETTINGS_READER)
        settings?: VendorSettingsReader,
    ) {
        this.settings = settings ?? null;
        this.config = parseEgressProxyConfig(key =>
            configService.get<string>(key),
        );
        if (this.config) {
            this.logger.log(
                `Исходящий прокси включён для хостов: ${this.config.hosts.join(', ')}`,
            );
        }
        // Без читателя настроек вендора env-конфиг окончательный.
        if (!this.settings) this.expiresAt = Number.POSITIVE_INFINITY;
    }

    get enabled(): boolean {
        this.refreshInBackground();
        return this.config !== null;
    }

    /** Для чек-листа админки: хост прокси и список хостов, токен не раскрываем. */
    status(): EgressProxyStatus {
        this.refreshInBackground();
        if (!this.config) return { enabled: false, proxyHost: null, hosts: [] };
        let proxyHost: string | null = null;
        try {
            proxyHost = new URL(this.config.baseUrl).host;
        } catch {
            proxyHost = null;
        }
        return { enabled: true, proxyHost, hosts: this.config.hosts };
    }

    route(url: string): EgressRoute {
        this.refreshInBackground();
        return routeEgress(url, this.config);
    }

    /** Пойдёт ли адрес через прокси — для подсказок «за рубежом, через прокси». */
    isProxied(url: string): boolean {
        return this.route(url).viaProxy;
    }

    /** fetch с учётом маршрута: прямой вызов не трогаем вовсе. */
    async fetch(url: string, init: RequestInit = {}): Promise<Response> {
        await this.ensureFresh();
        const route = routeEgress(url, this.config);
        if (!route.viaProxy) return fetch(url, init);
        return fetch(route.url, {
            ...init,
            headers: mergeHeaders(init.headers, route.headers),
        });
    }

    /** Снимок устарел — обновить в фоне, не задерживая вызов. */
    private refreshInBackground(): void {
        if (Date.now() < this.expiresAt) return;
        void this.ensureFresh();
    }

    /** Дождаться свежего снимка; параллельные вызовы делят одно чтение. */
    private async ensureFresh(): Promise<void> {
        if (Date.now() < this.expiresAt || !this.settings) return;
        if (!this.refreshing) {
            this.refreshing = this.reload(this.settings).finally(() => {
                this.refreshing = null;
            });
        }
        await this.refreshing;
    }

    private async reload(settings: VendorSettingsReader): Promise<void> {
        try {
            const values = await settings.getMany(
                Object.values(EGRESS_PROXY_ENV),
            );
            const next = parseEgressProxyConfig(
                key => values[key] ?? undefined,
            );
            const before = describeConfig(this.config);
            const after = describeConfig(next);
            if (before !== after) {
                this.logger.log(`Исходящий прокси: ${before} → ${after}`);
            }
            this.config = next;
        } catch (error) {
            this.logger.warn(
                `Настройки прокси не перечитаны (${(error as Error).message}) — прежний снимок`,
            );
        }
        this.expiresAt = Date.now() + EGRESS_PROXY_REFRESH_MS;
    }
}
