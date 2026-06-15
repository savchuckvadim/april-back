import { Request } from 'express';
import { AuthUser } from './auth-user.interface';

/**
 * Express-запрос с уже проставленным аутентифицированным пользователем.
 * Гард {@link JwtAuthGuard} кладёт сюда {@link AuthUser} после проверки токена.
 */
export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}
