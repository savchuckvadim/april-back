import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { BitrixTokenRepository } from '../repositories/bitrix-token.repository';
import { BitrixTokenEntity } from '../model/bitrix-token.model';
import { BitrixTokenDto, CreateBitrixTokenDto, GetBitrixTokenDto, SetBitrixSecretDto } from '../dto/bitrix-token.dto';
import { PrismaService } from 'src/core/prisma';
import { decrypt, encrypt } from '@/lib/utils/crypt.util';

@Injectable()
export class BitrixTokenService {
    constructor(
        private readonly repository: BitrixTokenRepository,
        private readonly prisma: PrismaService,
    ) { }



    // BitrixToken methods
    async storeOrUpdateToken(dto: CreateBitrixTokenDto): Promise<{ token: BitrixTokenEntity; message: string }> {
        try {
            // Find portal by domain
            const portal = await this.prisma.portal.findFirst({
                where: { domain: dto.domain },
            });

            if (!portal) {
                throw new NotFoundException(`Portal with domain ${dto.domain} not found`);
            }

            // Find app
            const app = await this.prisma.bitrix_apps.findFirst({
                where: {
                    portal_id: portal.id,
                    code: dto.code,
                },
            });

            if (!app) {
                throw new NotFoundException(`App with code ${dto.code} not found`);
            }
            return await this.storeOrUpdateAppToken(app.id, dto.token);

        } catch (error) {
            throw new BadRequestException(`Failed to store or update token: ${error.message}`);
        }
    }

    async storeOrUpdateAppToken(appId: bigint, dto: BitrixTokenDto): Promise<{ token: BitrixTokenEntity; message: string }> {
        try {


            const encryptedAccessToken = encrypt(dto.access_token);
            const encryptedRefreshToken = encrypt(dto.refresh_token);
            const encryptedApplicationToken = encrypt(dto.application_token);
            const encryptedMemberId = encrypt(dto.member_id);

            // Create or update token
            const token = await this.repository.storeOrUpdateTokensWithoutSecrets(
                appId,
                encryptedAccessToken,
                encryptedRefreshToken,
                new Date(dto.expires_at),
                encryptedApplicationToken,
                encryptedMemberId
            );

            if (!token) {
                throw new BadRequestException('Failed to create or update token');
            }

            return {
                token,
                message: 'Bitrix Token saved',
            };
        } catch (error) {
            throw new BadRequestException(`Failed to store or update token: ${error.message}`);
        }
    }

    async storeOrUpdateAppSecret(appId: bigint, dto: SetBitrixSecretDto): Promise<{ token: BitrixTokenEntity; message: string }> {
        try {


            // Encrypt token data
            const encryptedClientId = encrypt(dto.clientId); // You might want to get this from app secret
            const encryptedClientSecret = encrypt(dto.clientSecret); // You might want to get this from app secret
            console.log('storeOrUpdateAppSecret encryptedClientId', encryptedClientId);
            console.log('storeOrUpdateAppSecret encryptedClientSecret', encryptedClientSecret);

            // Create or update token
            const token = await this.repository.storeOrUpdateSecrets(
                appId,
                encryptedClientId,
                encryptedClientSecret

            );
            console.log('storeOrUpdateAppSecret token', token);

            if (!token) {
                throw new BadRequestException('Failed to create or update token');
            }

            return {
                token: {

                    ...token,
                    id: `${token.id}`,
                    bitrix_app_id: `${token.bitrix_app_id}`,
                },
                message: 'Bitrix Token saved',
            };
        } catch (error) {
            throw new BadRequestException(`Failed to store or update token: ${error.message}`);
        }
    }

    async getToken(dto: GetBitrixTokenDto): Promise<BitrixTokenEntity> {
        // Find portal by domain
        const portal = await this.prisma.portal.findFirst({
            where: { domain: dto.domain },
        });

        if (!portal) {
            throw new NotFoundException(`Portal with domain ${dto.domain} not found`);
        }

        // Find app
        const app = await this.prisma.bitrix_apps.findFirst({
            where: {
                portal_id: portal.id,
                code: dto.code,
            },
        });

        if (!app) {
            throw new NotFoundException(`App with code ${dto.code} not found`);
        }

        const token = await this.repository.findByAppId(app.id);
        if (!token) {
            throw new NotFoundException(`Token for app ${dto.code} not found`);
        }

        // Decrypt token data for response
        const decryptedToken = {
            ...token,
            client_id: decrypt(token.client_id),
            client_secret: decrypt(token.client_secret),
            access_token: decrypt(token.access_token),
            refresh_token: decrypt(token.refresh_token),
            application_token: token.application_token ? decrypt(token.application_token) : null,
            member_id: token.member_id ? decrypt(token.member_id) : null,
        };

        return decryptedToken;
    }

    async deleteToken(id: bigint): Promise<boolean> {
        return await this.repository.delete(id);
    }
}
