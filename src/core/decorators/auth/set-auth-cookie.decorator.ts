// src/common/decorators/set-auth-cookie.decorator.ts
import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { AuthCookieInterceptor } from '@/core/interceptors/auth-cookie.interceptor';

export function SetAuthCookie() {
  return applyDecorators(
    UseInterceptors(AuthCookieInterceptor),
  );
}
