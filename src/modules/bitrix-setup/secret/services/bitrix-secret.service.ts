import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { BitrixSecretRepository } from '../repositories/bitrix-secret.repository';
import { BitrixSecretEntity } from '../model/bitrix-secret.model';
import { CreateBitrixSecretDto, GetBitrixSecretDto } from '../dto/bitrix-secret.dto';
import * as crypto from 'crypto';

@Injectable()
export class BitrixSecretService {
    constructor(
        private readonly repository: BitrixSecretRepository,
    ) { }

    // Encryption/Decryption methods (similar to Laravel's Crypt)
    private encrypt(text: string): string {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(process.env.APP_KEY || 'default-key', 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    private decrypt(encryptedText: string): string {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(process.env.APP_KEY || 'default-key', 'salt', 32);
        const textParts = encryptedText.split(':');
        const iv = Buffer.from(textParts.shift()!, 'hex');
        const encrypted = textParts.join(':');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // BitrixSecret methods
    async storeOrUpdateSecret(dto: CreateBitrixSecretDto): Promise<{ app: BitrixSecretEntity; message: string }> {
        try {
            const encryptedClientId = this.encrypt(dto.client_id);
            const encryptedClientSecret = this.encrypt(dto.client_secret);

            const app = await this.repository.storeOrUpdate({
                group: dto.group,
                type: dto.type,
                code: dto.code,
                client_id: encryptedClientId,
                client_secret: encryptedClientSecret,
            });

            if (!app) {
                throw new BadRequestException('Failed to create or update app secret');
            }

            return {
                app,
                message: 'Bitrix App Secret saved',
            };
        } catch (error) {
            throw new BadRequestException(`Failed to store or update secret: ${error.message}`);
        }
    }

    async getSecretByCode(dto: GetBitrixSecretDto): Promise<{ app: BitrixSecretEntity; client_id: string; client_secret: string }> {
        const app = await this.repository.findByCode(dto.code);
        if (!app) {
            throw new NotFoundException(`App secret with code ${dto.code} not found`);
        }

        const clientId = this.decrypt(app.client_id);
        const clientSecret = this.decrypt(app.client_secret);

        return {
            app,
            client_id: clientId,
            client_secret: clientSecret,
        };
    }

    async deleteSecret(id: bigint): Promise<boolean> {
        return await this.repository.delete(id);
    }
}
