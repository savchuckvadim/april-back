import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BitrixAppService } from '../../bitrix-setup/app/services/bitrix-app.service'; // твой сервис для работы с таблицей приложений
import { firstValueFrom } from 'rxjs';
import { BitrixTokenService } from '../../bitrix-setup/token/services/bitrix-token.service';
import { BITRIX_APP_CODES } from 'src/modules/bitrix-setup/app/enums/bitrix-app.enum';
import { decrypt } from '@/lib/utils/crypt.util';

@Injectable()
export class BitrixAuthService {
    constructor(
        private readonly http: HttpService,
        private readonly appService: BitrixAppService,
        private readonly tokenService: BitrixTokenService,
    ) { }
    public async getFreshToken(domain: string): Promise<string> {
        const app = await this.appService.getApp({
            domain,
            code: BITRIX_APP_CODES.SALES,
        });
        if (!app) {
            throw new Error(`Bitrix app not installed for domain: ${domain}`);
        }

        let { access_token, expires_at } = app.bitrix_tokens || {};
        if (!access_token || !expires_at) {
            throw new Error(`Bitrix token not found for domain: ${domain}`);
        }

        // 1️⃣ Проверяем срок жизни токена
        const expiresAt = new Date(expires_at).getTime();
        const now = Date.now();
        const threeHours = 3 * 60 * 60 * 1000;
        const diff = expiresAt - now
        const isExpired = diff < threeHours

        if (isExpired) {
            console.log(`[Bitrix] Token for ${domain} expires soon → refreshing...`);
            const newToken = await this.refreshToken(domain);
            access_token = newToken.access_token;
        }
        return access_token || '';

    }
    async refreshToken(domain: string) {
        const app = await this.appService.getApp({
            domain,
            code: BITRIX_APP_CODES.SALES,
        });
        if (!app) {
            throw new Error(`No Bitrix app found for domain ${domain}`);
        }

        const cryptedefreshToken = app.bitrix_tokens?.refresh_token || '';
        const cryptedefreshClientId = app.bitrix_tokens?.client_id || '';
        const cryptedefreshClientSecret = app.bitrix_tokens?.client_secret || '';
        const refreshToken = decrypt(cryptedefreshToken || '');
        const clientId = decrypt(cryptedefreshClientId || '');
        const clientSecret = decrypt(cryptedefreshClientSecret || '');


        const url = `https://${domain}/oauth/token/?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}`;

        const response = await firstValueFrom(this.http.get(url));
        const data = response.data;

        if (!data.access_token) {
            throw new Error('Failed to refresh token: ' + JSON.stringify(data));
        }

        const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

        await this.tokenService.storeOrUpdateAppToken(app.id, {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: expiresAt,
            application_token: app.bitrix_tokens?.application_token || '',
            member_id: app.bitrix_tokens?.member_id || '',
        });

        return data;
    }
}
