/**
 * @deprecated Auth cookies are now set directly in AuthService.
 * Kept for backward compatibility with bitrix-app-install/ui controllers.
 */
import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response } from 'express';
import { CookieService } from '@/core/cookie/cookie.service';

@Injectable()
export class AuthCookieInterceptor implements NestInterceptor {
    constructor(private cookieService: CookieService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const ctx = context.switchToHttp();
        const res = ctx.getResponse<Response>();

        return next.handle().pipe(
            tap((data: Record<string, unknown>) => {
                if (data?.token && typeof data.token === 'string') {
                    this.cookieService.setAccessCookie(res, data.token);
                }
            }),
        );
    }
}
