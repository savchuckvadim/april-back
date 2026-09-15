import * as crypto from 'crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EncryptService {
    private SECRET_KEY: string;
    private ALGORITHM: string;
    private IV_LENGTH: number;
    constructor(private readonly configService: ConfigService) {
        this.SECRET_KEY =
            this.configService.get('APP_SECRET_KEY') || 'yo_camon_secret_key';
        this.ALGORITHM = 'aes-256-cbc';
        this.IV_LENGTH = 16;
    }
    encryptData(data: object): string {
        try {
            const iv = crypto.randomBytes(this.IV_LENGTH);
            const cipher = crypto.createCipheriv(
                this.ALGORITHM,
                Buffer.from(this.SECRET_KEY, 'base64'),
                iv,
            );
            let encrypted = cipher.update(JSON.stringify(data));
            encrypted = Buffer.concat([encrypted, cipher.final()]);

            return iv.toString('hex') + ':' + encrypted.toString('hex');
        } catch (e) {
            throw new HttpException(
                'encrypt Недопустимый токен ' + e,
                HttpStatus.NOT_FOUND,
            );
        }
    }

    decryptData(token: string): any {
        // Токен всегда имеет вид `iv:данные` (оба в hex). Без этой проверки
        // произвольная строка в адресе (например /api/files/58) роняла
        // Buffer.from(undefined), и наружу вместо человеческого «ссылка
        // недействительна» уходил текст TypeError с внутренностями.
        const [ivHex, encryptedHex] = (token ?? '').split(':');
        if (!ivHex || !encryptedHex) {
            throw new HttpException(
                'Ссылка на файл недействительна',
                HttpStatus.NOT_FOUND,
            );
        }

        try {
            const iv = Buffer.from(ivHex, 'hex');
            const encryptedText = Buffer.from(encryptedHex, 'hex');
            const decipher = crypto.createDecipheriv(
                this.ALGORITHM,
                Buffer.from(this.SECRET_KEY, 'base64'),
                iv,
            );
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return JSON.parse(decrypted.toString());
        } catch (e) {
            // Токен по форме верный, но не расшифровался: чужой ключ, обрезанная
            // ссылка, испорченный hex. Наружу — одно сообщение, подробности в лог.
            console.error('Не удалось расшифровать токен ссылки на файл', e);
            throw new HttpException(
                'Ссылка на файл недействительна',
                HttpStatus.NOT_FOUND,
            );
        }
    }
}
