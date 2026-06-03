import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { decrypt, encrypt } from '@/shared/lib/utils/crypt.util';
import { BitrixAuthRepository } from './bitrix-auth.repository';
import {
    BitrixAppCredentials,
    RefreshedBitrixToken,
} from '../domain/bitrix-app-credentials.interface';

@Injectable()
export class BitrixAuthPrismaRepository implements BitrixAuthRepository {
    constructor(private readonly prisma: PrismaService) {}

    async findCredentials(
        domain: string,
        code: string,
    ): Promise<BitrixAppCredentials | null> {
        const app = await this.prisma.bitrix_apps.findFirst({
            where: { code, portals: { domain } },
        });
        if (!app) {
            return null;
        }

        const token = await this.prisma.bitrix_tokens.findFirst({
            where: { bitrix_app_id: app.id },
        });
        if (!token) {
            return null;
        }

        return {
            appId: app.id,
            clientId: decrypt(token.client_id),
            clientSecret: decrypt(token.client_secret),
            accessToken: decrypt(token.access_token),
            refreshToken: decrypt(token.refresh_token),
            applicationToken: token.application_token
                ? decrypt(token.application_token)
                : '',
            memberId: token.member_id ? decrypt(token.member_id) : '',
            expiresAt: token.expires_at ?? undefined,
        };
    }

    async saveRefreshedToken(
        appId: bigint,
        token: RefreshedBitrixToken,
    ): Promise<void> {
        const data = {
            access_token: encrypt(token.accessToken),
            refresh_token: encrypt(token.refreshToken),
            expires_at: token.expiresAt,
            application_token: encrypt(token.applicationToken),
            member_id: encrypt(token.memberId),
            updated_at: new Date(),
        };

        const existing = await this.prisma.bitrix_tokens.findFirst({
            where: { bitrix_app_id: appId },
        });

        if (existing) {
            await this.prisma.bitrix_tokens.update({
                where: { id: existing.id },
                data,
            });
            return;
        }

        await this.prisma.bitrix_tokens.create({
            data: {
                bitrix_app_id: appId,
                client_id: encrypt('__PENDING__'),
                client_secret: encrypt('__PENDING__'),
                created_at: new Date(),
                ...data,
            },
        });
    }
}
