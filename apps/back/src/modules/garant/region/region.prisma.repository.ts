import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { RegionRepository } from './region.repository';
import { PortalRegionEntity, RegionEntity } from './region.entity';
import { createRegionEntityFromPrisma } from './lib/region-entity.util';
import { Decimal } from '@prisma/client/runtime/library';
import { portal_region, regions } from 'generated/prisma';

@Injectable()
export class RegionPrismaRepository implements RegionRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(region: Partial<RegionEntity>): Promise<RegionEntity | null> {
        try {
            const now = new Date();
            const result = await this.prisma.regions.create({
                data: {
                    number: region.number!,
                    title: region.title!,
                    code: region.code!,
                    infoblock: region.infoblock!,
                    abs: region.abs!,
                    tax: region.tax!,
                    tax_abs: region.tax_abs!,
                    created_at: now,
                    updated_at: now,
                },
            });
            return createRegionEntityFromPrisma(result);
        } catch (error) {
            console.error('Error creating region:', error);
            return null;
        }
    }

    async update(region: Partial<RegionEntity>): Promise<RegionEntity | null> {
        try {
            const { id, ...data } = region;
            const result = await this.prisma.regions.update({
                where: { id: BigInt(id!) },
                data: {
                    ...data,
                    updated_at: new Date(),
                },
            });
            return createRegionEntityFromPrisma(result);
        } catch (error) {
            console.error('Error updating region:', error);
            return null;
        }
    }

    async findById(id: string): Promise<RegionEntity | null> {
        try {
            const result = await this.prisma.regions.findUnique({
                where: { id: BigInt(id) },
            });
            if (!result) return null;
            return createRegionEntityFromPrisma(result);
        } catch (error) {
            console.error('Error finding region by id:', error);
            return null;
        }
    }

    async findMany(): Promise<RegionEntity[] | null> {
        try {
            const result = await this.prisma.regions.findMany();
            if (!result) return null;
            return result.map(region => createRegionEntityFromPrisma(region));
        } catch (error) {
            console.error('Error finding regions:', error);
            return null;
        }
    }

    async findByCode(code: string): Promise<RegionEntity | null> {
        try {
            const result = await this.prisma.regions.findFirst({
                where: { code },
            });
            if (!result) return null;
            return createRegionEntityFromPrisma(result);
        } catch (error) {
            console.error('Error finding region by code:', error);
            return null;
        }
    }

    async findByCodes(codes: string[]): Promise<RegionEntity[] | null> {
        try {
            const result = await this.prisma.regions.findMany({
                where: { code: { in: codes } },
            });
            if (!result) return null;
            return result.map(region => createRegionEntityFromPrisma(region));
        } catch (error) {
            console.error('Error finding regions by codes:', error);
            return null;
        }
    }

    async findByPortalId(portalId: number): Promise<RegionEntity[] | null> {
        const portalRegions = await this.prisma.portal_region.findMany({
            where: { portal_id: portalId },
        });
        const regions = await this.prisma.regions.findMany({
            where: {
                id: { in: portalRegions.map(region => region.region_id) },
            },
        });
        const withOwnAbsRegions = regions.map((region: regions) => {
            const portalRegion: portal_region | undefined = portalRegions.find(
                portalRegion => portalRegion.region_id === region.id,
            );
            // const withOwnAbsRegion = {
            //     ...region,
            //     tax_abs: portalRegion?.own_tax_abs
            //         ? portalRegion.own_tax_abs
            //         : region.tax_abs,
            //     tax: portalRegion?.own_tax ? portalRegion.own_tax : region.tax,
            //     abs: portalRegion?.own_abs ? portalRegion.own_abs : region.abs,
            // };
            return this.getRegionEntityMergedByPortalRegion(
                region,
                portalRegion,
            );
        });
        if (!withOwnAbsRegions) return null;
        return withOwnAbsRegions;
    }

    async delete(id: string): Promise<RegionEntity | null> {
        try {
            const result = await this.prisma.regions.delete({
                where: { id: BigInt(id) },
            });
            if (!result) return null;
            return createRegionEntityFromPrisma(result);
        } catch (error) {
            console.error('Error deleting region:', error);
            return null;
        }
    }

    async createPortalRegion(
        portalId: number,
        regionId: number,
    ): Promise<RegionEntity | null> {
        try {
            let portalRegion = await this.prisma.portal_region.findUnique({
                where: {
                    portal_id_region_id: {
                        portal_id: portalId,
                        region_id: regionId,
                    },
                },
            });
            if (!portalRegion) {
                portalRegion = await this.prisma.portal_region.create({
                    data: { portal_id: portalId, region_id: regionId },
                });
            }
            const region = await this.findById(regionId.toString());
            if (!region) {
                throw new NotFoundException(
                    `Something wrong. Region with id ${regionId} not found in database`,
                );
            }
            return this.getRegionEntityMergedByPortalRegion(
                region,
                portalRegion,
            );
        } catch (error) {
            console.error('Error creating portal region:', error);
            return null;
        }
    }

    async findByPortalIdPortalRegion(
        portalId: number,
        regionId: number,
    ): Promise<PortalRegionEntity | null> {
        const region = await this.findById(regionId.toString());
        if (!region) {
            throw new NotFoundException(
                `Something wrong. Region with id ${regionId} not found in database`,
            );
        }
        const result = await this.prisma.portal_region.findUnique({
            where: {
                portal_id_region_id: {
                    portal_id: portalId,
                    region_id: regionId,
                },
            },
        });
        const portalRegionEntity = new PortalRegionEntity();
        portalRegionEntity.portalId = portalId;
        portalRegionEntity.regionId = regionId;
        portalRegionEntity.own_abs = result?.own_abs
            ? Number(result.own_abs)
            : 0;
        portalRegionEntity.own_tax = result?.own_tax
            ? Number(result.own_tax)
            : 0;
        portalRegionEntity.own_tax_abs = result?.own_tax_abs
            ? Number(result.own_tax_abs)
            : 0;
        portalRegionEntity.regionCode = region?.code || '';
        return portalRegionEntity;
    }

    async updatePortalRegion(
        portalId: number,
        regionId: number,
        own_abs: Decimal | null,
        own_tax: Decimal | null,
        own_tax_abs: Decimal | null,
    ): Promise<RegionEntity | null> {
        try {
            const result = await this.prisma.portal_region.update({
                where: {
                    portal_id_region_id: {
                        portal_id: portalId,
                        region_id: regionId,
                    },
                },
                data: { own_abs, own_tax, own_tax_abs },
            });
            const region = await this.findById(regionId.toString());
            if (!region) {
                throw new NotFoundException(
                    `Something wrong. Region with id ${regionId} not found in database`,
                );
            }
            return this.getRegionEntityMergedByPortalRegion(region, result);
        } catch (error) {
            console.error('Error updating portal region:', error);
            return null;
        }
    }

    async deletePortalRegion(
        portalId: number,
        regionId: number,
    ): Promise<boolean> {
        try {
            await this.prisma.portal_region.delete({
                where: {
                    portal_id_region_id: {
                        portal_id: portalId,
                        region_id: regionId,
                    },
                },
            });
            return true;
        } catch (error) {
            console.error('Error deleting portal region:', error);
            throw new InternalServerErrorException(
                'Something wrong. Failed to delete portal region',
                error,
            );
        }
    }

    private getRegionEntityMergedByPortalRegion(
        region: regions | RegionEntity,
        portalRegion?: portal_region,
    ): RegionEntity {
        const isRegionEntity = region instanceof RegionEntity;
        const regionEntity = isRegionEntity
            ? region
            : createRegionEntityFromPrisma(region);

        if (!portalRegion) {
            return regionEntity;
        }

        const result = {
            ...regionEntity,
            tax_abs: portalRegion?.own_tax_abs
                ? Number(portalRegion.own_tax_abs)
                : regionEntity.tax_abs,

            tax: portalRegion?.own_tax
                ? Number(portalRegion.own_tax)
                : regionEntity.tax,
            abs: portalRegion?.own_abs
                ? Number(portalRegion.own_abs)
                : regionEntity.abs,
        };
        return result;
    }
}
