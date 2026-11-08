import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcrypt';

/** Стоимость bcrypt: ~250 мс на хэш — перебор дорог, вход быстрый. */
const BCRYPT_ROUNDS = 12;

/** Требования к паролю — одни на бэке и в подсказке фронта. */
export const CABINET_PASSWORD_MIN_LENGTH = 8;
export const CABINET_PASSWORD_MAX_LENGTH = 72; // предел bcrypt

/**
 * Пароли учёток кабинета: только bcrypt. Laravel пишет `$2y$` — node-bcrypt
 * его понимает как `$2b$` (алгоритм тот же), поэтому префикс приводится.
 * Всё, что не bcrypt (заглушка заявки онбординга, легаси-шифр), паролем не
 * считается: войти можно только после установки пароля по ссылке.
 */
@Injectable()
export class PasswordHasher {
    hash(password: string): Promise<string> {
        return hash(password, BCRYPT_ROUNDS);
    }

    isUsable(stored: string | null | undefined): boolean {
        return typeof stored === 'string' && /^\$2[aby]\$\d\d\$/.test(stored);
    }

    async verify(
        password: string,
        stored: string | null | undefined,
    ): Promise<boolean> {
        if (!this.isUsable(stored)) return false;
        const normalized = (stored as string).replace(/^\$2y\$/, '$2b$');
        try {
            return await compare(password, normalized);
        } catch {
            return false;
        }
    }
}
