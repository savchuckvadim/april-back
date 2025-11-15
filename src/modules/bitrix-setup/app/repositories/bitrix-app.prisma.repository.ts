import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { BitrixAppRepository } from './bitrix-app.repository';
import { BitrixAppEntity } from '../model/bitrix-app.model';
import { createBitrixAppEntityFromPrisma, getRelations } from '../model/lib/bitrix-app.helper';



@Injectable()
export class BitrixAppPrismaRepository implements BitrixAppRepository {
    constructor(private readonly prisma: PrismaService) { }

    // BitrixApp methods
    async storeOrUpdate(app: Partial<BitrixAppEntity>): Promise<BitrixAppEntity | null> {
        try {
            // First try to find existing app
            const existingApp = await this.prisma.bitrix_apps.findFirst({
                where: {
                    portal_id: app.portal_id!,
                    code: app.code!,
                },
            });

            let result: NonNullable<Awaited<ReturnType<PrismaService['bitrix_apps']['update']>>>;
            if (existingApp) {
                // Update existing app
                result = await this.prisma.bitrix_apps.update({
                    where: { id: existingApp.id },
                    data: {
                        group: app.group,
                        type: app.type,
                        status: app.status,
                        updated_at: new Date(),
                    },
                    include: {
                        portals: true,
                        bitrix_tokens: true,
                        bitrix_app_placements: true,
                    },
                });
            } else {
                // Create new app
                result = await this.prisma.bitrix_apps.create({
                    data: {
                        portal_id: app.portal_id!,
                        group: app.group!,
                        type: app.type!,
                        code: app.code!,
                        status: app.status!,
                    },
                    include: {
                        portals: true,
                        bitrix_tokens: true,
                        bitrix_app_placements: true,
                    },
                });
            }
            // const bitrix_tokens = await this.prisma.bitrix_tokens.findFirst({
            //     where: { bitrix_app_id: result.id },
            // }) || undefined;
            // const bitrix_app_placements = await this.prisma.bitrix_app_placements.findFirst({
            //     where: { bitrix_app_id: result.id },
            // }) || undefined;
            // const bitrix_settings = await this.prisma.bitrix_settings.findFirst({
            //     where: { settingable_id: result.id },
            // }) || undefined;
            // const portals = await this.prisma.portals.findFirst({
            //     where: { id: result.portal_id },
            // }) || undefined;
            const { bitrix_tokens, bitrix_app_placements, bitrix_settings, portal } = await getRelations(this.prisma, result.id, result.portal_id);
            return createBitrixAppEntityFromPrisma(result, bitrix_tokens, bitrix_app_placements, bitrix_settings, portal);
        } catch (error) {
            console.error('Error in storeOrUpdate:', error);
            return null;
        }
    }


    async findById(id: bigint): Promise<BitrixAppEntity | null> {
        try {
            const result = await this.prisma.bitrix_apps.findUnique({
                where: { id },
                include: {
                    portals: true,
                    bitrix_tokens: true,
                    bitrix_app_placements: true,
                },
            });
            if (!result) {
                return null;
            }
            const { bitrix_tokens, bitrix_app_placements, bitrix_settings, portal } = await getRelations(this.prisma, result.id, result.portal_id);

            return createBitrixAppEntityFromPrisma(result, bitrix_tokens, bitrix_app_placements, bitrix_settings, portal);
        } catch (error) {
            console.error('Error in findById:', error);
            return null;
        }
    }

    async findMany(): Promise<BitrixAppEntity[] | null> {
        try {
            const result = await this.prisma.bitrix_apps.findMany({
                include: {
                    portals: true,
                    bitrix_tokens: true,
                    bitrix_app_placements: true,
                },
            });
            const fullResult: BitrixAppEntity[] = [];

            for (const app of result) {
                const { bitrix_tokens, bitrix_app_placements, bitrix_settings, portal } = await getRelations(this.prisma, app.id, app.portal_id);
                fullResult.push(createBitrixAppEntityFromPrisma(app, bitrix_tokens, bitrix_app_placements, bitrix_settings, portal));
            }

            return fullResult;
        } catch (error) {
            console.error('Error in findMany:', error);
            return null;
        }
    }

    async findByCode(code: string): Promise<BitrixAppEntity | null> {
        try {
            const result = await this.prisma.bitrix_apps.findFirst({
                where: { code },
                include: {
                    portals: true,
                    bitrix_tokens: true,
                    bitrix_app_placements: true,
                },
            });
            if (!result) {
                return null;
            }
            const { bitrix_tokens, bitrix_app_placements, bitrix_settings, portal } = await getRelations(this.prisma, result.id, result.portal_id);
            return createBitrixAppEntityFromPrisma(result, bitrix_tokens, bitrix_app_placements, bitrix_settings, portal);
        } catch (error) {
            console.error('Error in findByCode:', error);
            return null;
        }
    }

    async findByCodeAndDomain(code: string, domain: string): Promise<BitrixAppEntity | null> {
        try {
            const result = await this.prisma.bitrix_apps.findFirst({
                where: {
                    code,
                    portals: {
                        domain,
                    },
                },
                include: {
                    portals: true,
                    bitrix_tokens: true,
                    bitrix_app_placements: true,
                },
            });
            if (!result) {
                return null;
            }
            const { bitrix_tokens, bitrix_app_placements, bitrix_settings, portal } = await getRelations(this.prisma, result.id, result.portal_id);
            return createBitrixAppEntityFromPrisma(result, bitrix_tokens, bitrix_app_placements, bitrix_settings, portal);
        } catch (error) {
            console.error('Error in findByCodeAndDomain:', error);
            return null;
        }
    }

    async findByPortal(domain: string): Promise<BitrixAppEntity[] | null> {
        try {
            const result = await this.prisma.bitrix_apps.findMany({
                where: {
                    portals: {
                        domain,
                    },
                },
                include: {
                    portals: true,
                    bitrix_tokens: true,
                    bitrix_app_placements: true,
                },
            });
            const fullResult: BitrixAppEntity[] = [];

            for (const app of result) {
                const { bitrix_tokens, bitrix_app_placements, bitrix_settings, portal } = await getRelations(this.prisma, app.id, app.portal_id);
                fullResult.push(createBitrixAppEntityFromPrisma(app, bitrix_tokens, bitrix_app_placements, bitrix_settings, portal));
            }

            return fullResult;
        } catch (error) {
            console.error('Error in findByPortal:', error);
            return null;
        }
    }
    async findByPortalId(portalId: number): Promise<BitrixAppEntity[] | null> {
        try {
            const result = await this.prisma.bitrix_apps.findMany({
                where: { portal_id: BigInt(portalId) },
            });
            const fullResult: BitrixAppEntity[] = [];
            for (const app of result) {
                const { bitrix_tokens, bitrix_app_placements, bitrix_settings, portal } = await getRelations(this.prisma, app.id, app.portal_id);
                fullResult.push(createBitrixAppEntityFromPrisma(app, bitrix_tokens, bitrix_app_placements, bitrix_settings, portal));
            }
            return fullResult;
        } catch (error) {
            console.error('Error in findByPortalId:', error);
            return null;
        }
    }
    async update(id: bigint, data: Partial<BitrixAppEntity>): Promise<BitrixAppEntity> {
        try {
            const result = await this.prisma.bitrix_apps.update({
                where: { id },
                data: {
                    group: data.group,
                    type: data.type,
                    status: data.status,
                    updated_at: new Date(),
                },
                include: {
                    portals: true,
                    bitrix_tokens: true,
                    bitrix_app_placements: true,
                },
            });
            const { bitrix_tokens, bitrix_app_placements, bitrix_settings, portal } = await getRelations(this.prisma, result.id, result.portal_id);
            return createBitrixAppEntityFromPrisma(result, bitrix_tokens, bitrix_app_placements, bitrix_settings, portal);
        } catch (error) {
            console.error('Error in update:', error);
            throw error;
        }
    }

    async delete(id: bigint): Promise<boolean> {
        try {
            await this.prisma.bitrix_apps.delete({
                where: { id },
            });
            return true;
        } catch (error) {
            console.error('Error in delete:', error);
            return false;
        }
    }
}
