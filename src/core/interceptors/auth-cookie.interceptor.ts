// src/common/interceptors/auth-cookie.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response } from 'express';
import { CookieService } from '@/core/cookie/cookie.service';

@Injectable()
export class AuthCookieInterceptor implements NestInterceptor {
    constructor(private cookieService: CookieService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const ctx = context.switchToHttp();
        const res = ctx.getResponse<Response>();

        return next.handle().pipe(
            tap((data) => {
                if (data?.token) {
                    this.cookieService.setAuthCookie(res, data.token);
                    delete data.token; // если не хочешь отдавать токен в JSON
                }
            }),
        );
    }
}
