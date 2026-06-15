import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcrypt';
import { AUTH_OPTIONS } from '../config/auth.constants';
import { AuthModuleOptions } from '../config/auth.config';
import { AuthTokenService } from './auth-token.service';
import { Role } from '../types/role.enum';
import { AuthUser } from '../types/auth-user.interface';
import { LoginDto } from '../dto/login.dto';
import { AuthResponseDto } from '../dto/auth-response.dto';

/**
 * Бизнес-логика входа SuperUser: сверка учётных данных из `.env` и выпуск JWT.
 * Одна ответственность — вход/представление субъекта; работа с токеном делегирована
 * {@link AuthTokenService}.
 */
@Injectable()
export class AuthService {
    constructor(
        private readonly tokenService: AuthTokenService,
        @Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions,
    ) {}

    /**
     * Проверяет учётные данные SuperUser и выдаёт access-токен.
     * Бросает {@link UnauthorizedException} при неверном логине/пароле или
     * незаданных учётных данных в `.env`.
     */
    async login(dto: LoginDto): Promise<AuthResponseDto> {
        const user = await this.validateSuperUser(dto.login, dto.password);
        return {
            accessToken: this.tokenService.sign(user),
            user,
        };
    }

    /** Возвращает данные текущего субъекта (для GET /auth/me). */
    getMe(user: AuthUser): AuthUser {
        return user;
    }

    /** Сверяет логин/пароль с учётными данными SuperUser из конфигурации. */
    private async validateSuperUser(
        login: string,
        password: string,
    ): Promise<AuthUser> {
        const { superUser } = this.options;

        if (!superUser.login || !superUser.passwordHash) {
            throw new UnauthorizedException(
                'SuperUser не сконфигурирован: задайте SUPERUSER_LOGIN и SUPERUSER_PASSWORD',
            );
        }

        const loginMatches = login === superUser.login;
        const passwordMatches = await compare(password, superUser.passwordHash);

        if (!loginMatches || !passwordMatches) {
            throw new UnauthorizedException('Неверный логин или пароль');
        }

        return {
            sub: superUser.login,
            login: superUser.login,
            role: Role.SUPER_USER,
        };
    }
}
