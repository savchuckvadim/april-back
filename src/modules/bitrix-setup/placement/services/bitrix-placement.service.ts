import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { BitrixPlacementRepository } from '../repositories/bitrix-placement.repository';
import { BitrixPlacementEntity } from '../model/bitrix-placement.model';
import { CreateBitrixPlacementDto } from '../dto/bitrix-placement.dto';
import { PrismaService } from 'src/core/prisma';

@Injectable()
export class BitrixPlacementService {
    constructor(
        private readonly repository: BitrixPlacementRepository,
        private readonly prisma: PrismaService,
    ) { }

    // BitrixPlacement methods
    async storePlacements(dto: CreateBitrixPlacementDto): Promise<{ message: string; app_id: bigint }> {
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
                throw new NotFoundException(`App with code ${dto.code} and domain ${dto.domain} not found`);
            }

            const placements = await this.repository.storePlacements(app.id, dto.placements);
            if (!placements.length) {
                throw new BadRequestException('Failed to create placements');
            }

            return {
                message: 'Bitrix App Placements saved',
                app_id: app.id,
            };
        } catch (error) {
            throw new BadRequestException(`Failed to store placements: ${error.message}`);
        }
    }

    async getPlacementsByAppId(appId: bigint): Promise<BitrixPlacementEntity[]> {
        return await this.repository.findByAppId(appId);
    }

    async deletePlacementsByAppId(appId: bigint): Promise<boolean> {
        return await this.repository.deleteByAppId(appId);
    }

    async deletePlacement(id: bigint): Promise<boolean> {
        return await this.repository.delete(id);
    }
}
