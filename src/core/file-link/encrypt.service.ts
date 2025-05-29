import * as crypto from 'crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';


@Injectable()
export class EncryptService {
    private SECRET_KEY: string;
    private ALGORITHM: string;
    private IV_LENGTH: number;
    constructor(
        private readonly configService: ConfigService
    ) {
        this.SECRET_KEY = this.configService.get('APP_SECRET_KEY') || 'yo_camon_secret_key';
        this.ALGORITHM = 'aes-256-cbc';
        this.IV_LENGTH = 16;
      
    }
    encryptData(data: object): string {
        try {
        
            const iv = crypto.randomBytes(this.IV_LENGTH);
            const cipher = crypto.createCipheriv(this.ALGORITHM, Buffer.from(this.SECRET_KEY, 'base64'), iv);
            let encrypted = cipher.update(JSON.stringify(data));
            encrypted = Buffer.concat([encrypted, cipher.final()]);
        
            return iv.toString('hex') + ':' + encrypted.toString('hex');
        } catch (e) {
            throw new HttpException('encrypt Недопустимый токен ' + e, HttpStatus.NOT_FOUND);
        }
    }

    decryptData(token: string): any {
        try {
            const [ivHex, encryptedHex] = token.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const encryptedText = Buffer.from(encryptedHex, 'hex');
            const decipher = crypto.createDecipheriv(this.ALGORITHM, Buffer.from(this.SECRET_KEY, 'base64'), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return JSON.parse(decrypted.toString());
        } catch (e) {
            throw new HttpException('decrypt Недопустимый токен ' + e, HttpStatus.NOT_FOUND);
        }
    }
}