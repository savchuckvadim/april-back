import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { BitrixPlacementRepository } from './bitrix-placement.repository';
import { BitrixPlacementEntity } from '../model/bitrix-placement.model';

@Injectable()
export class BitrixPlacementPrismaRepository implements BitrixPlacementRepository {
    constructor(private readonly prisma: PrismaService) { }

    // BitrixPlacement methods
    async storePlacements(appId: bigint, placements: Partial<BitrixPlacementEntity>[]): Promise<BitrixPlacementEntity[]> {
        try {
            const result = await this.prisma.bitrix_app_placements.createMany({
                data: placements.map(placement => ({
                    bitrix_app_id: appId,
                    code: placement.code!,
                    type: placement.type!,
                    group: placement.group!,
                    status: placement.status!,
                    bitrix_heandler: placement.bitrix_heandler!,
                    public_heandler: placement.public_heandler!,
                    bitrix_codes: placement.bitrix_codes!,
                })),
            });

            // Return the created placements
            const createdPlacements = await this.prisma.bitrix_app_placements.findMany({
                where: { bitrix_app_id: appId },
                include: {
                    bitrix_apps: true,
                },
            });

            return createdPlacements as BitrixPlacementEntity[];
        } catch (error) {
            console.error('Error in storePlacements:', error);
            return [];
        }
    }

    async findById(id: bigint): Promise<BitrixPlacementEntity | null> {
        try {
            const result = await this.prisma.bitrix_app_placements.findUnique({
                where: { id },
                include: {
                    bitrix_apps: true,
                },
            });
            return result as BitrixPlacementEntity;
        } catch (error) {
            console.error('Error in findById:', error);
            return null;
        }
    }

    async findByAppId(appId: bigint): Promise<BitrixPlacementEntity[]> {
        try {
            const result = await this.prisma.bitrix_app_placements.findMany({
                where: { bitrix_app_id: appId },
                include: {
                    bitrix_apps: true,
                },
            });
            return result as BitrixPlacementEntity[];
        } catch (error) {
            console.error('Error in findByAppId:', error);
            return [];
        }
    }

    async deleteByAppId(appId: bigint): Promise<boolean> {
        try {
            await this.prisma.bitrix_app_placements.deleteMany({
                where: { bitrix_app_id: appId },
            });
            return true;
        } catch (error) {
            console.error('Error in deleteByAppId:', error);
            return false;
        }
    }

    async delete(id: bigint): Promise<boolean> {
        try {
            await this.prisma.bitrix_app_placements.delete({
                where: { id },
            });
            return true;
        } catch (error) {
            console.error('Error in delete:', error);
            return false;
        }
    }
}
