import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { BitrixTokenRepository } from './bitrix-token.repository';
import { BitrixTokenEntity } from '../model/bitrix-token.model';

@Injectable()
export class BitrixTokenPrismaRepository implements BitrixTokenRepository {
    constructor(private readonly prisma: PrismaService) { }

    // BitrixToken methods
    async storeOrUpdate(token: Partial<BitrixTokenEntity>): Promise<BitrixTokenEntity | null> {
        try {
            // First try to find existing token
            const existingToken = await this.prisma.bitrix_tokens.findFirst({
                where: { bitrix_app_id: token.bitrix_app_id! },
            });

            const cleanData = Object.fromEntries(
                Object.entries({
                  client_id: token.client_id,
                  client_secret: token.client_secret,
                  access_token: token.access_token,
                  refresh_token: token.refresh_token,
                  expires_at: token.expires_at,
                  application_token: token.application_token,
                  member_id: token.member_id,
                  updated_at: new Date(),
                }).filter(([_, v]) => v !== undefined)
              );


            let result;
            if (existingToken) {
                // Update existing token
                result = await this.prisma.bitrix_tokens.update({
                    where: { id: existingToken.id },
                    data: cleanData,
                    include: {
                        bitrix_apps: true,
                    },
                });
            } else {
                // Create new token
                result = await this.prisma.bitrix_tokens.create({
                    data: {
                        bitrix_app_id: token.bitrix_app_id!,
                        client_id: token.client_id!,
                        client_secret: token.client_secret!,
                        access_token: token.access_token!,
                        refresh_token: token.refresh_token!,
                        expires_at: token.expires_at,
                        application_token: token.application_token,
                        member_id: token.member_id,
                    },
                    include: {
                        bitrix_apps: true,
                    },
                });
            }
            return result as BitrixTokenEntity;
        } catch (error) {
            console.error('Error in storeOrUpdate:', error);
            return null;
        }
    }

    async findById(id: bigint): Promise<BitrixTokenEntity | null> {
        try {
            const result = await this.prisma.bitrix_tokens.findUnique({
                where: { id },
                include: {
                    bitrix_apps: true,
                },
            });
            return result as BitrixTokenEntity;
        } catch (error) {
            console.error('Error in findById:', error);
            return null;
        }
    }

    async findByAppId(appId: bigint): Promise<BitrixTokenEntity | null> {
        try {
            const result = await this.prisma.bitrix_tokens.findFirst({
                where: { bitrix_app_id: appId },
                include: {
                    bitrix_apps: true,
                },
            });
            return result as BitrixTokenEntity;
        } catch (error) {
            console.error('Error in findByAppId:', error);
            return null;
        }
    }

    async delete(id: bigint): Promise<boolean> {
        try {
            await this.prisma.bitrix_tokens.delete({
                where: { id },
            });
            return true;
        } catch (error) {
            console.error('Error in delete:', error);
            return false;
        }
    }
}
