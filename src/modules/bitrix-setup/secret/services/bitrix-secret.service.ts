import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { BitrixSecretRepository } from '../repositories/bitrix-secret.repository';
import { BitrixSecretEntity } from '../model/bitrix-secret.model';
import { CreateBitrixSecretDto, GetBitrixSecretDto } from '../dto/bitrix-secret.dto';
import * as crypto from 'crypto';
import { decrypt, encrypt } from '@/lib/utils/crypt.util';


/**
 * Bitrix Secret Service
 создаются и пересохраняются с фронта фофремя создания app по инструкции
 */


@Injectable()
export class BitrixSecretService {
    constructor(
        private readonly repository: BitrixSecretRepository,
    ) { }

    // Encryption/Decryption methods (similar to Laravel's Crypt)


    // BitrixSecret methods
    async storeOrUpdateSecret(dto: CreateBitrixSecretDto): Promise<{ app: BitrixSecretEntity; message: string }> {
        try {
            const encryptedClientId = encrypt(dto.client_id);
            const encryptedClientSecret = encrypt(dto.client_secret);

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

        const clientId = decrypt(app.client_id);
        const clientSecret = decrypt(app.client_secret);

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
