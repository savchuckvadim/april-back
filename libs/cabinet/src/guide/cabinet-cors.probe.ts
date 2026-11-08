import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
    LOCAL_APP_API_URL_ENV,
    LOCAL_APP_DEFAULT_API_URL,
} from '@lib/marketplace-core';
import type { CabinetCorsCheck } from './cabinet-guide.types';

/** Ручка входа с сайта — ровно её браузер вызывает с cookie. */
const REFRESH_PATH = '/api/cabinet/auth/refresh';
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Пускает ли api.pbx сайт кабинета с cookie — живым preflight-запросом,
 * как браузер: OPTIONS с Origin сайта. Читать CORS_ORIGIN из окружения
 * admin нельзя: у pbx и admin он может быть свой (apps/<app>/.env
 * перекрывает корневой), а значение имеет только pbx.
 */
@Injectable()
export class CabinetCorsProbe {
    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {}

    async check(siteUrl: string): Promise<CabinetCorsCheck> {
        const origin = new URL(siteUrl).origin;
        const api = (
            this.config.get<string>(LOCAL_APP_API_URL_ENV) ??
            LOCAL_APP_DEFAULT_API_URL
        ).replace(/\/+$/, '');
        try {
            const response = await firstValueFrom(
                this.http.request({
                    method: 'OPTIONS',
                    url: `${api}${REFRESH_PATH}`,
                    headers: {
                        Origin: origin,
                        'Access-Control-Request-Method': 'POST',
                        'Access-Control-Request-Headers': 'content-type',
                    },
                    timeout: PROBE_TIMEOUT_MS,
                    validateStatus: () => true,
                }),
            );
            const allowOrigin = header(
                response.headers,
                'access-control-allow-origin',
            );
            const allowCredentials = header(
                response.headers,
                'access-control-allow-credentials',
            );
            return allowOrigin === origin && allowCredentials === 'true'
                ? 'ok'
                : 'blocked';
        } catch {
            return 'unreachable';
        }
    }
}

function header(headers: unknown, name: string): string {
    if (typeof headers !== 'object' || headers === null) return '';
    const value = (headers as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : '';
}
