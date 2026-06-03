import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IBitrixTokenProvider } from '@lib/bitrix';
import { BitrixAuthRepository } from '../persistence/bitrix-auth.repository';
import { BITRIX_APP_CODES } from '../domain/bitrix-app-code.enum';

interface BitrixOAuthTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

/** За сколько до истечения токена инициировать обновление (3 часа). */
const REFRESH_THRESHOLD_MS = 3 * 60 * 60 * 1000;

/**
 * Реализация порта IBitrixTokenProvider: отдаёт валидный access-токен
 * для портала, при необходимости обновляя его по refresh-токену через
 * OAuth Bitrix. Вся работа с БД учёток инкапсулирована в репозитории.
 */
@Injectable()
export class BitrixTokenRefreshService implements IBitrixTokenProvider {
    constructor(
        private readonly http: HttpService,
        private readonly repository: BitrixAuthRepository,
    ) {}

    public async getFreshToken(domain: string): Promise<string> {
        const credentials = await this.repository.findCredentials(
            domain,
            BITRIX_APP_CODES.SALES,
        );
        if (!credentials) {
            throw new Error(`Bitrix app not installed for domain: ${domain}`);
        }
        if (!credentials.accessToken || !credentials.expiresAt) {
            throw new Error(`Bitrix token not found for domain: ${domain}`);
        }

        const isExpired =
            credentials.expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS;
        if (!isExpired) {
            return credentials.accessToken;
        }

        console.log(
            `[Bitrix] Token for ${domain} expires soon → refreshing...`,
        );
        return this.refreshToken(domain);
    }

    private async refreshToken(domain: string): Promise<string> {
        const credentials = await this.repository.findCredentials(
            domain,
            BITRIX_APP_CODES.SALES,
        );
        if (!credentials) {
            throw new Error(`No Bitrix app found for domain ${domain}`);
        }

        const url =
            `https://${domain}/oauth/token/?grant_type=refresh_token` +
            `&client_id=${credentials.clientId}` +
            `&client_secret=${credentials.clientSecret}` +
            `&refresh_token=${credentials.refreshToken}`;

        const response = await firstValueFrom(
            this.http.get<BitrixOAuthTokenResponse>(url),
        );
        const data = response.data;

        if (!data.access_token) {
            throw new Error('Failed to refresh token: ' + JSON.stringify(data));
        }

        const expiresAt = new Date(Date.now() + data.expires_in * 1000);

        await this.repository.saveRefreshedToken(credentials.appId, {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt,
            applicationToken: credentials.applicationToken,
            memberId: credentials.memberId,
        });

        return data.access_token;
    }
}
