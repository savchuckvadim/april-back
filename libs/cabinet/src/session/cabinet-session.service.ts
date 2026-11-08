import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { User } from 'generated/prisma';
import { AuthTokenService, Role } from '@lib/auth';
import { CabinetConfig } from '../config/cabinet.config';
import {
    CABINET_ACCOUNT_SUB_PREFIX,
    CABINET_TOKEN_NAMES,
} from '../domain/cabinet.constants';
import {
    CabinetTokenRepository,
    generateOpaqueToken,
} from '../persistence/cabinet-token.repository';
import { CabinetUserRepository } from '../persistence/cabinet-user.repository';
import { CabinetMembershipRepository } from '../persistence/cabinet-membership.repository';
import { CabinetThrottle } from '../infrastructure/cabinet-throttle';
import { PasswordHasher } from '../infrastructure/password-hasher';

/** Пара токенов входа с сайта. */
export interface IssuedCabinetSession {
    accessToken: string;
    accessExpiresAt: string | null;
    refreshToken: string;
    refreshExpiresAt: Date;
    userId: number;
}

/** Вход: 10 неверных попыток на email за 15 минут. */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

const BAD_CREDENTIALS = 'Неверный email или пароль';

/**
 * Вход в кабинет с сайта (вне Битрикса): email + пароль → короткий
 * access-JWT (общий секрет приложений) + долгий refresh (строка в
 * `personal_access_tokens`, только хэш, ротация на каждом обновлении).
 *
 * Войти может только учётка с паролем и хотя бы одним действующим доступом
 * к неотключённому порталу: регистрации нет, доступ выдают владелец
 * портала или администратор April.
 */
@Injectable()
export class CabinetSessionService {
    constructor(
        private readonly config: CabinetConfig,
        private readonly tokens: AuthTokenService,
        private readonly refreshTokens: CabinetTokenRepository,
        private readonly users: CabinetUserRepository,
        private readonly memberships: CabinetMembershipRepository,
        private readonly hasher: PasswordHasher,
        private readonly throttle: CabinetThrottle,
    ) {}

    async login(
        email: string,
        password: string,
    ): Promise<IssuedCabinetSession> {
        const throttleKey = `login:${email.trim().toLowerCase()}`;
        await this.throttle.hit(
            throttleKey,
            LOGIN_LIMIT,
            LOGIN_WINDOW_SECONDS,
            'Слишком много попыток входа — попробуйте через 15 минут или восстановите пароль',
        );
        const user = await this.users.findByEmail(email);
        if (!user || !(await this.hasher.verify(password, user.password))) {
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }
        await this.assertHasAccess(user);
        await this.throttle.reset(throttleKey);
        return this.issue(user);
    }

    /** Обновление по refresh-токену: старый гаснет, выдаётся новая пара. */
    async refresh(refreshToken: string): Promise<IssuedCabinetSession> {
        const userId = await this.refreshTokens.consume(
            refreshToken,
            CABINET_TOKEN_NAMES.refresh,
        );
        if (userId === null) {
            throw new UnauthorizedException('Сессия истекла — войдите заново');
        }
        const user = await this.users.findById(userId);
        if (!user) {
            throw new UnauthorizedException('Учётная запись не найдена');
        }
        await this.assertHasAccess(user);
        return this.issue(user);
    }

    async logout(refreshToken: string | null): Promise<void> {
        if (refreshToken) {
            await this.refreshTokens.consume(
                refreshToken,
                CABINET_TOKEN_NAMES.refresh,
            );
        }
    }

    private async assertHasAccess(user: User): Promise<void> {
        const active = await this.memberships.listActiveByUser(user.id);
        const open = active.filter(
            row => row.portal.approval_status !== 'blocked',
        );
        if (open.length === 0) {
            throw new ForbiddenException(
                'Доступ в кабинет не открыт — обратитесь к владельцу кабинета вашей организации или в April',
            );
        }
    }

    private async issue(user: User): Promise<IssuedCabinetSession> {
        const accessToken = this.tokens.sign(
            {
                sub: `${CABINET_ACCOUNT_SUB_PREFIX}${user.id}`,
                login: user.email ?? `user-${user.id}`,
                role: Role.CLIENT,
                userId: Number(user.id),
                ...(user.client_id !== null
                    ? { clientId: Number(user.client_id) }
                    : {}),
            },
            { expiresIn: this.config.accessTtl() },
        );
        const { exp } = this.tokens.verify(accessToken);
        const refreshToken = generateOpaqueToken();
        const refreshExpiresAt = new Date(
            Date.now() + this.config.refreshTtlDays() * 24 * 3600 * 1000,
        );
        await this.refreshTokens.save(
            user.id,
            CABINET_TOKEN_NAMES.refresh,
            refreshToken,
            refreshExpiresAt,
        );
        return {
            accessToken,
            accessExpiresAt: exp ? new Date(exp * 1000).toISOString() : null,
            refreshToken,
            refreshExpiresAt,
            userId: Number(user.id),
        };
    }
}
