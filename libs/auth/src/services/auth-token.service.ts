import { Inject, Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AUTH_OPTIONS } from '../config/auth.constants';
import { AuthModuleOptions } from '../config/auth.config';
import { AuthJwtPayload, AuthUser } from '../types/auth-user.interface';

/** Параметры выпуска токена, отличные от конфигурации библиотеки. */
export interface AuthSignOptions {
    /**
     * Срок жизни токена (формат jsonwebtoken: `'1h'`, `'15m'`, секунды).
     * Не задан — `AUTH_JWT_EXPIRES_IN` приложения. Короткий access с
     * refresh-токеном — у кабинета клиента (libs/cabinet).
     */
    expiresIn?: string | number;
}

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
    sign(user: AuthUser, signOptions: AuthSignOptions = {}): string {
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
            ...(user.domain !== undefined && { domain: user.domain }),
            ...(user.memberId !== undefined && { memberId: user.memberId }),
            ...(user.userId !== undefined && { userId: user.userId }),
        };
        return this.jwtService.sign(payload, {
            secret: this.options.jwt.secret,
            expiresIn: (signOptions.expiresIn ??
                this.options.jwt.expiresIn) as JwtSignOptions['expiresIn'],
        });
    }

    /** Проверяет токен и возвращает полезную нагрузку; бросает при ошибке/протухании. */
    verify(token: string): AuthJwtPayload {
        return this.jwtService.verify<AuthJwtPayload>(token, {
            secret: this.options.jwt.secret,
        });
    }
}
