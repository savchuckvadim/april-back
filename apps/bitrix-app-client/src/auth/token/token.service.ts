import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class TokenService {
    private readonly userTokenableType = 'User';
    private readonly refreshTokenName = 'refresh_token';
    private readonly passwordResetTokenName = 'password_reset';

    constructor(private readonly prisma: PrismaService) {}

    hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    generateRefreshTokenString(): string {
        return randomBytes(64).toString('hex');
    }

    generatePasswordResetTokenString(): string {
        return randomBytes(48).toString('hex');
    }

    async saveRefreshToken(
        userId: number,
        refreshToken: string,
        ttlDays = 7,
    ): Promise<void> {
        const hash = this.hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

        await this.prisma.personal_access_tokens.create({
            data: {
                tokenable_type: this.userTokenableType,
                tokenable_id: BigInt(userId),
                name: this.refreshTokenName,
                token: hash,
                expires_at: expiresAt,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
    }

    async validateRefreshToken(
        refreshToken: string,
        userId: number,
    ): Promise<boolean> {
        const hash = this.hashToken(refreshToken);

        const record = await this.prisma.personal_access_tokens.findFirst({
            where: {
                token: hash,
                tokenable_type: this.userTokenableType,
                tokenable_id: BigInt(userId),
            },
        });

        if (!record) return false;
        if (record.expires_at && record.expires_at < new Date()) {
            await this.prisma.personal_access_tokens.delete({
                where: { id: record.id },
            });
            return false;
        }

        await this.prisma.personal_access_tokens.update({
            where: { id: record.id },
            data: { last_used_at: new Date() },
        });

        return true;
    }

    async revokeRefreshToken(refreshToken: string): Promise<void> {
        const hash = this.hashToken(refreshToken);

        await this.prisma.personal_access_tokens.deleteMany({
            where: {
                token: hash,
                tokenable_type: this.userTokenableType,
                name: this.refreshTokenName,
            },
        });
    }

    async revokeAllUserTokens(userId: number): Promise<void> {
        await this.prisma.personal_access_tokens.deleteMany({
            where: {
                tokenable_type: this.userTokenableType,
                tokenable_id: BigInt(userId),
                name: this.refreshTokenName,
            },
        });
    }

    async savePasswordResetToken(
        userId: number,
        passwordResetToken: string,
        ttlMinutes = 60,
    ): Promise<void> {
        await this.revokeAllPasswordResetTokens(userId);

        const hash = this.hashToken(passwordResetToken);
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

        await this.prisma.personal_access_tokens.create({
            data: {
                tokenable_type: this.userTokenableType,
                tokenable_id: BigInt(userId),
                name: this.passwordResetTokenName,
                token: hash,
                expires_at: expiresAt,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
    }

    async validatePasswordResetToken(token: string): Promise<number | null> {
        const record = await this.findValidTokenRecord(
            token,
            this.passwordResetTokenName,
        );
        if (!record) return null;

        await this.prisma.personal_access_tokens.update({
            where: { id: record.id },
            data: { last_used_at: new Date() },
        });

        return Number(record.tokenable_id);
    }

    async consumePasswordResetToken(token: string): Promise<number | null> {
        const record = await this.findValidTokenRecord(
            token,
            this.passwordResetTokenName,
        );
        if (!record) return null;

        await this.prisma.personal_access_tokens.delete({
            where: { id: record.id },
        });

        return Number(record.tokenable_id);
    }

    async revokeAllPasswordResetTokens(userId: number): Promise<void> {
        await this.prisma.personal_access_tokens.deleteMany({
            where: {
                tokenable_type: this.userTokenableType,
                tokenable_id: BigInt(userId),
                name: this.passwordResetTokenName,
            },
        });
    }

    private async findValidTokenRecord(token: string, name: string) {
        const hash = this.hashToken(token);

        const record = await this.prisma.personal_access_tokens.findFirst({
            where: {
                token: hash,
                tokenable_type: this.userTokenableType,
                name,
            },
        });

        if (!record) return null;

        if (record.expires_at && record.expires_at < new Date()) {
            await this.prisma.personal_access_tokens.delete({
                where: { id: record.id },
            });
            return null;
        }

        return record;
    }
}
