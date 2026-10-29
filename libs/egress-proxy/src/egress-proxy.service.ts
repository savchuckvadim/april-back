import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    mergeHeaders,
    parseEgressProxyConfig,
    routeEgress,
} from './egress-route.util';
import type {
    EgressProxyConfig,
    EgressProxyStatus,
    EgressRoute,
} from './egress-proxy.types';

/**
 * Исходящий прокси: `route()` переписывает адрес и даёт заголовки, `fetch()` —
 * обёртка над глобальным fetch с учётом маршрута; потребители на axios
 * пользуются `route()` сами. Без env прокси выключен — всё идёт напрямую.
 * Состояния нет, домен не нужен: правило одно на приложение.
 */
@Injectable()
export class EgressProxyService {
    private readonly logger = new Logger(EgressProxyService.name);
    private readonly config: EgressProxyConfig | null;

    constructor(configService: ConfigService) {
        this.config = parseEgressProxyConfig(key =>
            configService.get<string>(key),
        );
        if (this.config) {
            this.logger.log(
                `Исходящий прокси включён для хостов: ${this.config.hosts.join(', ')}`,
            );
        }
    }

    get enabled(): boolean {
        return this.config !== null;
    }

    /** Для чек-листа админки: хост прокси и список хостов, токен не раскрываем. */
    status(): EgressProxyStatus {
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
        return routeEgress(url, this.config);
    }

    /** Пойдёт ли адрес через прокси — для подсказок «за рубежом, через прокси». */
    isProxied(url: string): boolean {
        return this.route(url).viaProxy;
    }

    /** fetch с учётом маршрута: прямой вызов не трогаем вовсе. */
    async fetch(url: string, init: RequestInit = {}): Promise<Response> {
        const route = this.route(url);
        if (!route.viaProxy) return fetch(url, init);
        return fetch(route.url, {
            ...init,
            headers: mergeHeaders(init.headers, route.headers),
        });
    }
}
