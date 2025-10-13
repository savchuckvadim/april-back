import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { BitrixSecretRepository } from './bitrix-secret.repository';
import { BitrixSecretEntity } from '../model/bitrix-secret.model';

@Injectable()
export class BitrixSecretPrismaRepository implements BitrixSecretRepository {
    constructor(private readonly prisma: PrismaService) { }

    // BitrixSecret methods
    async storeOrUpdate(secret: Partial<BitrixSecretEntity>): Promise<BitrixSecretEntity | null> {
        try {
            // First try to find existing secret
            const existingSecret = await this.prisma.bitrix_app_secrets.findFirst({
                where: { code: secret.code! },
            });

            let result;
            if (existingSecret) {
                // Update existing secret
                result = await this.prisma.bitrix_app_secrets.update({
                    where: { id: existingSecret.id },
                    data: {
                        group: secret.group,
                        type: secret.type,
                        client_id: secret.client_id,
                        client_secret: secret.client_secret,
                        updated_at: new Date(),
                    },
                });
            } else {
                // Create new secret
                result = await this.prisma.bitrix_app_secrets.create({
                    data: {
                        group: secret.group!,
                        type: secret.type!,
                        code: secret.code!,
                        client_id: secret.client_id!,
                        client_secret: secret.client_secret!,
                    },
                });
            }
            return result as BitrixSecretEntity;
        } catch (error) {
            console.error('Error in storeOrUpdate:', error);
            return null;
        }
    }

    async findById(id: bigint): Promise<BitrixSecretEntity | null> {
        try {
            const result = await this.prisma.bitrix_app_secrets.findUnique({
                where: { id },
            });
            return result as BitrixSecretEntity;
        } catch (error) {
            console.error('Error in findById:', error);
            return null;
        }
    }

    async findByCode(code: string): Promise<BitrixSecretEntity | null> {
        try {
            const result = await this.prisma.bitrix_app_secrets.findFirst({
                where: { code },
            });
            return result as BitrixSecretEntity;
        } catch (error) {
            console.error('Error in findByCode:', error);
            return null;
        }
    }

    async delete(id: bigint): Promise<boolean> {
        try {
            await this.prisma.bitrix_app_secrets.delete({
                where: { id },
            });
            return true;
        } catch (error) {
            console.error('Error in delete:', error);
            return false;
        }
    }
}
