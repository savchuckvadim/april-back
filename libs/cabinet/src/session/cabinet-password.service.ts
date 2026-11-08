import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { User } from 'generated/prisma';
import { CabinetConfig } from '../config/cabinet.config';
import {
    CABINET_DEFAULTS,
    CABINET_TOKEN_NAMES,
    CabinetPasswordLinkPurpose,
} from '../domain/cabinet.constants';
import {
    CabinetTokenName,
    CabinetTokenRepository,
    generateOpaqueToken,
} from '../persistence/cabinet-token.repository';
import { CabinetUserRepository } from '../persistence/cabinet-user.repository';
import { CabinetMembershipRepository } from '../persistence/cabinet-membership.repository';
import { CabinetMailer } from '../infrastructure/cabinet-mailer.port';
import { CabinetThrottle } from '../infrastructure/cabinet-throttle';
import {
    CABINET_PASSWORD_MAX_LENGTH,
    CABINET_PASSWORD_MIN_LENGTH,
    PasswordHasher,
} from '../infrastructure/password-hasher';
import { maskEmail } from '../members/cabinet-member.view';

export interface IssuedPasswordLink {
    url: string;
    expiresAt: Date;
    emailSent: boolean;
}

export interface PasswordLinkState {
    valid: boolean;
    purpose: CabinetPasswordLinkPurpose | null;
    emailMasked: string | null;
}

const TOKEN_NAME: Record<CabinetPasswordLinkPurpose, CabinetTokenName> = {
    setup: CABINET_TOKEN_NAMES.passwordSetup,
    reset: CABINET_TOKEN_NAMES.passwordReset,
};

/** Сброс пароля: 5 запросов на email за час — письма не спамятся. */
const RESET_LIMIT = 5;
const RESET_WINDOW_SECONDS = 3600;

/**
 * Пароль учётки кабинета: ссылки установки (приглашение) и восстановления,
 * установка пароля по ссылке. Ссылка одноразовая, в БД — только хэш.
 *
 * Регистрации нет: ссылку установки выпускает владелец или администратор
 * April, ссылку восстановления — сам человек по email (только если у него
 * есть действующий доступ к порталу). Почты нет — письмо «не ушло», а
 * ссылку админ передаёт вручную.
 */
@Injectable()
export class CabinetPasswordService {
    private readonly logger = new Logger(CabinetPasswordService.name);

    constructor(
        private readonly config: CabinetConfig,
        private readonly tokens: CabinetTokenRepository,
        private readonly users: CabinetUserRepository,
        private readonly memberships: CabinetMembershipRepository,
        private readonly mailer: CabinetMailer,
        private readonly throttle: CabinetThrottle,
        private readonly hasher: PasswordHasher,
    ) {}

    /** Новая ссылка (прежние ссылки того же назначения гаснут) + письмо. */
    async issueLink(
        user: User,
        purpose: CabinetPasswordLinkPurpose,
    ): Promise<IssuedPasswordLink> {
        if (!user.email) {
            throw new BadRequestException(
                'У учётной записи нет email — ссылку отправить некуда',
            );
        }
        const name = TOKEN_NAME[purpose];
        await this.tokens.revokeAll(user.id, name);
        const token = generateOpaqueToken();
        const expiresAt = new Date(Date.now() + this.ttlMs(purpose));
        await this.tokens.save(user.id, name, token, expiresAt);

        const url = `${this.config.siteUrl()}/auth/set-password/${token}`;
        const emailSent = await this.mailer.sendPasswordLink({
            to: user.email,
            name: user.name,
            url,
            purpose,
            expiresAt,
        });
        this.logger.log(
            `Ссылка (${purpose}) для user:${user.id} выпущена, письмо ${emailSent ? 'отправлено' : 'НЕ отправлено'}`,
        );
        return { url, expiresAt, emailSent };
    }

    /** «Забыли пароль»: ответ одинаковый — по нему нельзя проверять email. */
    async requestReset(email: string): Promise<void> {
        await this.throttle.hit(
            `reset:${email.trim().toLowerCase()}`,
            RESET_LIMIT,
            RESET_WINDOW_SECONDS,
            'Слишком много запросов восстановления — попробуйте через час',
        );
        const user = await this.users.findByEmail(email);
        if (!user) return;
        const active = await this.memberships.listActiveByUser(user.id);
        if (active.length === 0) return;
        await this.issueLink(user, 'reset');
    }

    async inspect(token: string): Promise<PasswordLinkState> {
        for (const purpose of ['setup', 'reset'] as const) {
            const userId = await this.tokens.findUserId(
                token,
                TOKEN_NAME[purpose],
            );
            if (userId !== null) {
                const user = await this.users.findById(userId);
                return {
                    valid: user !== null,
                    purpose,
                    emailMasked: maskEmail(user?.email),
                };
            }
        }
        return { valid: false, purpose: null, emailMasked: null };
    }

    /** Установить пароль по ссылке; все сессии входа с сайта гаснут. */
    async setPassword(token: string, password: string): Promise<void> {
        assertPasswordShape(password);
        const userId =
            (await this.tokens.consume(token, TOKEN_NAME.setup)) ??
            (await this.tokens.consume(token, TOKEN_NAME.reset));
        if (userId === null) {
            throw new BadRequestException(
                'Ссылка недействительна или уже использована — запросите новую',
            );
        }
        const user = await this.users.findById(userId);
        if (!user) {
            throw new NotFoundException('Учётная запись не найдена');
        }
        await this.users.setPasswordHash(
            user.id,
            await this.hasher.hash(password),
        );
        await this.tokens.revokeAll(user.id, CABINET_TOKEN_NAMES.refresh);
        await this.tokens.revokeAll(user.id, TOKEN_NAME.setup);
        await this.tokens.revokeAll(user.id, TOKEN_NAME.reset);
    }

    private ttlMs(purpose: CabinetPasswordLinkPurpose): number {
        return purpose === 'setup'
            ? CABINET_DEFAULTS.passwordSetupTtlDays * 24 * 3600 * 1000
            : CABINET_DEFAULTS.passwordResetTtlMinutes * 60 * 1000;
    }
}

export function assertPasswordShape(password: string): void {
    if (
        password.length < CABINET_PASSWORD_MIN_LENGTH ||
        password.length > CABINET_PASSWORD_MAX_LENGTH
    ) {
        throw new BadRequestException(
            `Пароль — от ${CABINET_PASSWORD_MIN_LENGTH} до ${CABINET_PASSWORD_MAX_LENGTH} символов`,
        );
    }
    if (!/\d/.test(password) || !/[^\d\s]/.test(password)) {
        throw new BadRequestException(
            'Пароль должен содержать хотя бы одну цифру и одну букву',
        );
    }
}
