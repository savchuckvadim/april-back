import { Inject, Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AUTH_OPTIONS } from '../config/auth.constants';
import { AuthModuleOptions } from '../config/auth.config';
import { AuthJwtPayload, AuthUser } from '../types/auth-user.interface';

/**
 * Выпуск и проверка access-JWT. Секрет берётся из {@link AuthModuleOptions}
 * (общий для всех приложений → токен, выданный одним, валиден в другом).
 *
 * Одна ответственность: работа с токеном. Бизнес-правила входа — в AuthService.
 */
@Injectable()
export class AuthTokenService {
    constructor(
        private readonly jwtService: JwtService,
        @Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions,
    ) {}

    /** Подписывает access-токен для субъекта. */
    sign(user: AuthUser): string {
        const payload: AuthUser = {
            sub: user.sub,
            login: user.login,
            role: user.role,
            ...(user.clientId !== undefined && { clientId: user.clientId }),
            ...(user.portalId !== undefined && { portalId: user.portalId }),
            ...(user.isAdmin !== undefined && { isAdmin: user.isAdmin }),
            ...(user.bitrixUserId !== undefined && {
                bitrixUserId: user.bitrixUserId,
            }),
        };
        return this.jwtService.sign(payload, {
            secret: this.options.jwt.secret,
            expiresIn: this.options.jwt
                .expiresIn as JwtSignOptions['expiresIn'],
        });
    }

    /** Проверяет токен и возвращает полезную нагрузку; бросает при ошибке/протухании. */
    verify(token: string): AuthJwtPayload {
        return this.jwtService.verify<AuthJwtPayload>(token, {
            secret: this.options.jwt.secret,
        });
    }
}
