import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Шифрование/дешифрование строковых ключей портала.
 *
 * Единственная ответственность — симметричное шифрование значения
 * (AES-256-CBC) на основе секрета `APP_SECRET_KEY` из окружения.
 * 32-байтный ключ детерминированно выводится через scrypt, поэтому
 * работает с секретом произвольной длины.
 *
 * Формат хранения: `<iv в hex>:<шифртекст в hex>`. Каждый вызов
 * {@link encrypt} использует случайный IV, поэтому один и тот же
 * открытый текст даёт разные шифртексты.
 */
@Injectable()
export class PortalKeyCryptoService {
    private readonly algorithm = 'aes-256-cbc';
    private readonly ivLength = 16;
    private readonly salt = 'portal-keys-salt';

    private deriveKey(): Buffer {
        const secret = process.env.APP_SECRET_KEY ?? 'default-secret-key';
        return crypto.scryptSync(secret, this.salt, 32);
    }

    /** Шифрует открытое значение ключа. */
    encrypt(plain: string): string {
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(
            this.algorithm,
            this.deriveKey(),
            iv,
        );
        const encrypted = Buffer.concat([
            cipher.update(plain, 'utf8'),
            cipher.final(),
        ]);
        return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
    }

    /**
     * Дешифрует значение. Бросает ошибку, если payload повреждён или
     * зашифрован другим секретом — вызывающий код решает, как реагировать.
     */
    decrypt(payload: string): string {
        const [ivHex, dataHex] = payload.split(':');
        if (!ivHex || !dataHex) {
            throw new Error('Некорректный формат зашифрованного значения');
        }
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            this.deriveKey(),
            Buffer.from(ivHex, 'hex'),
        );
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(dataHex, 'hex')),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    }
}
