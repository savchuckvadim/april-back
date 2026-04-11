import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CookieService {
    constructor(private configService: ConfigService) {}

    private getCookieOptions(isProd: boolean, domain: string) {
        return {
            httpOnly: true,
            secure: true,
            sameSite: isProd ? ('none' as const) : ('lax' as const),
            domain: isProd ? domain : 'localhost',
        };
    }

    private get isProd(): boolean {
        return this.configService.get('NODE_ENV') === 'production';
    }

    private get domain(): string {
        return (
            this.configService.get('AUTH_COOKIE_SPA_DOMAIN') || '.april-app.ru'
        );
    }

    setAccessCookie(res: Response, token: string) {
        res.cookie('access_token', token, {
            ...this.getCookieOptions(this.isProd, this.domain),
            path: '/',
            maxAge: 15 * 60 * 1000, // 15 минут
        });
    }

    setRefreshCookie(res: Response, token: string) {
        res.cookie('refresh_token', token, {
            ...this.getCookieOptions(this.isProd, this.domain),
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
        });
    }

    setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
        this.setAccessCookie(res, accessToken);
        this.setRefreshCookie(res, refreshToken);
    }

    clearAuthCookies(res: Response) {
        const base = this.getCookieOptions(this.isProd, this.domain);

        res.clearCookie('access_token', { ...base, path: '/' });
        res.clearCookie('refresh_token', { ...base, path: '/' });
    }

    /** @deprecated use clearAuthCookies */
    clearAuthCookie(res: Response) {
        this.clearAuthCookies(res);
    }

    /** @deprecated use setAuthCookies */
    setAuthCookie(res: Response, token: string) {
        this.setAccessCookie(res, token);
    }
}
