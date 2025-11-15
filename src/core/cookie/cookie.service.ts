// src/common/services/cookie.service.ts
import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CookieService {
    constructor(private configService: ConfigService) { }

    private readonly COOKIE_NAME = 'access_token';

    setAuthCookie(res: Response, token: string) {
        const isProd = this.configService.get('NODE_ENV') === 'production';
        console.log('isProd', isProd);
        console.log('token', token);
        console.log('COOKIE_NAME', this.COOKIE_NAME);
        res.cookie(this.COOKIE_NAME, token, {
            // httpOnly: true,
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
    }

    clearAuthCookie(res: Response) {
        const isProd = this.configService.get('NODE_ENV') === 'production';
        res.clearCookie(this.COOKIE_NAME, {
            httpOnly: true,
            secure: true,
            sameSite: true ? 'none' : 'lax',

        });
    }
}
