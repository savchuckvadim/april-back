// src/common/services/cookie.service.ts
import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
const host = 'april-bitrix-main.vercel.app';

@Injectable()
export class CookieService {
    constructor(private configService: ConfigService) { }

    private readonly COOKIE_NAME = 'access_token';

    setAuthCookie(res: Response, token: string) {
        const isProd = this.configService.get('NODE_ENV') === 'production';
        const domain = this.configService.get('AUTH_COOKIE_SPA_DOMAIN') || '.april-app.ru';
        console.log('isProd', isProd);
        console.log('token', token);
        console.log('COOKIE_NAME', this.COOKIE_NAME);
        console.log('AUTH_COOKIE_SPA_DOMAIN', domain);
        res.cookie(this.COOKIE_NAME, token, {
            httpOnly: true,
            secure: true,
            sameSite: isProd ? 'none' : 'lax',          // КРОСС-ДОМЕН обязательно нужно 'none'
            domain: isProd ? domain : 'localhost',   // общий домен для subdomain → MUST HAVE
            path: '/',                 // важно
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
    }

    clearAuthCookie(res: Response) {
        const isProd = this.configService.get('NODE_ENV') === 'production';
        const domain = this.configService.get('AUTH_COOKIE_SPA_DOMAIN') || '.april-app.ru';
        console.log('AUTH_COOKIE_SPA_DOMAIN', domain);
        res.clearCookie(this.COOKIE_NAME, {
            httpOnly: true,
            secure: true,
            sameSite: isProd ? 'none' : 'lax',          // КРОСС-ДОМЕН обязательно нужно 'none'
            domain:  isProd ?  domain : 'localhost',   // общий домен для subdomain → MUST HAVE
            path: '/',                 // важно

        });
    }
}
