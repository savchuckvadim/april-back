import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BitrixAppService } from '../../../bitrix-setup/app/services/bitrix-app.service'; // твой сервис для работы с таблицей приложений
import { firstValueFrom } from 'rxjs';
import { BitrixTokenService } from '../../../bitrix-setup/token/services/bitrix-token.service';
import { BITRIX_APP_CODES } from 'src/modules/bitrix-setup/app/enums/bitrix-app.enum';

@Injectable()
export class BitrixAuthService {
    constructor(
        private readonly http: HttpService,
        private readonly appService: BitrixAppService,
        private readonly tokenService: BitrixTokenService,
    ) { }

    async refreshToken(domain: string) {
        const app = await this.appService.getApp({
            domain,
            code: BITRIX_APP_CODES.SALES,
        });
        if (!app) {
            throw new Error(`No Bitrix app found for domain ${domain}`);
        }

        const refreshToken = app.bitrix_tokens?.refresh_token;

        const url = `https://${domain}/oauth/token/?grant_type=refresh_token&client_id=local.68e76bf63fcee8.85701907&client_secret=iEbZAGP6yMxrZxuI3MPzvaZg64VAr6cZoIEVaMaIJV5iMWHd4b&refresh_token=${refreshToken}`;

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
