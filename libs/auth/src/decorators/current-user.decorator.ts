import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth-user.interface';
import { AuthenticatedRequest } from '../types/auth-request.interface';

/**
 * Извлекает аутентифицированного пользователя из запроса (его кладёт
 * {@link JwtAuthGuard}). Без аргумента возвращает весь {@link AuthUser},
 * с аргументом — конкретное поле.
 *
 * @example
 * ```ts
 * @Get('me')
 * me(@CurrentUser() user: AuthUser) { ... }
 *
 * @Get('login')
 * who(@CurrentUser('login') login: string) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
    (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
        const user = request.user;
        return data ? user?.[data] : user;
    },
);
