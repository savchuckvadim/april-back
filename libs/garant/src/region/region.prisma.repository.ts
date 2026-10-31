import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { RegionRepository } from './region.repository';
import {
    PortalRegionEntity,
    PortalRegionLink,
    PortalRegionOwnPatch,
    RegionEntity,
} from './region.entity';
import { createRegionEntityFromPrisma } from './lib/region-entity.util';
import { resolvePortalPrice } from './lib/portal-price.util';
import { Prisma, portal_region, regions } from 'generated/prisma';

/** Связь portal_region вместе с регионом и регионом-источником рабса */
type PortalRegionRow = portal_region & {
    region: regions;
    own_abs_region: regions | null;
};

const PORTAL_REGION_INCLUDE = {
    region: true,
    own_abs_region: true,
} as const;

const toNumberOrNull = (value: Prisma.Decimal | null): number | null =>
    value === null ? null : Number(value);

const toDecimalOrNull = (value: string | null): Prisma.Decimal | null =>
    value === null ? null : new Prisma.Decimal(value);

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
        try {
            const rows = await this.findPortalRegionRows(portalId);
            return rows.map(row => this.toMergedRegion(row));
        } catch (error) {
            console.error('Error finding portal regions:', error);
            return null;
        }
    }

    async findPortalRegionLinks(portalId: number): Promise<PortalRegionLink[]> {
        const rows = await this.findPortalRegionRows(portalId);
        return rows.map(row => this.toLink(row));
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
            const where = this.portalRegionKey(portalId, regionId);
            let row = await this.prisma.portal_region.findUnique({
                where,
                include: PORTAL_REGION_INCLUDE,
            });
            if (!row) {
                row = await this.prisma.portal_region.create({
                    data: { portal_id: portalId, region_id: regionId },
                    include: PORTAL_REGION_INCLUDE,
                });
            }
            return this.toMergedRegion(row);
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
        const row = await this.prisma.portal_region.findUnique({
            where: this.portalRegionKey(portalId, regionId),
            include: { own_abs_region: true },
        });
        const entity = new PortalRegionEntity();
        entity.portalId = portalId;
        entity.regionId = regionId;
        entity.own_abs = Number(row?.own_abs ?? 0);
        entity.own_tax = Number(row?.own_tax ?? 0);
        entity.own_tax_abs = Number(row?.own_tax_abs ?? 0);
        entity.own_abs_region_id = row?.own_abs_region
            ? Number(row.own_abs_region.id)
            : null;
        entity.own_abs_region_code = row?.own_abs_region?.code ?? null;
        entity.regionCode = region.code;
        return entity;
    }

    async updatePortalRegion(
        portalId: number,
        regionId: number,
        patch: PortalRegionOwnPatch,
    ): Promise<RegionEntity | null> {
        try {
            const row = await this.prisma.portal_region.update({
                where: this.portalRegionKey(portalId, regionId),
                data: this.toOwnData(patch),
                include: PORTAL_REGION_INCLUDE,
            });
            return this.toMergedRegion(row);
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
                where: this.portalRegionKey(portalId, regionId),
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

    private portalRegionKey(portalId: number, regionId: number) {
        return {
            portal_id_region_id: {
                portal_id: portalId,
                region_id: regionId,
            },
        };
    }

    private findPortalRegionRows(portalId: number): Promise<PortalRegionRow[]> {
        return this.prisma.portal_region.findMany({
            where: { portal_id: portalId },
            include: PORTAL_REGION_INCLUDE,
        });
    }

    /** Ключ не передан — поле не трогаем, null — сбрасываем */
    private toOwnData(
        patch: PortalRegionOwnPatch,
    ): Prisma.portal_regionUncheckedUpdateInput {
        const data: Prisma.portal_regionUncheckedUpdateInput = {};
        if (patch.own_abs !== undefined) {
            data.own_abs = toDecimalOrNull(patch.own_abs);
        }
        if (patch.own_tax !== undefined) {
            data.own_tax = toDecimalOrNull(patch.own_tax);
        }
        if (patch.own_tax_abs !== undefined) {
            data.own_tax_abs = toDecimalOrNull(patch.own_tax_abs);
        }
        if (patch.own_abs_region_id !== undefined) {
            data.own_abs_region_id =
                patch.own_abs_region_id === null
                    ? null
                    : BigInt(patch.own_abs_region_id);
        }
        return data;
    }

    private toLink(row: PortalRegionRow): PortalRegionLink {
        return {
            portalId: Number(row.portal_id),
            regionId: Number(row.region_id),
            ownAbs: toNumberOrNull(row.own_abs),
            ownTax: toNumberOrNull(row.own_tax),
            ownTaxAbs: toNumberOrNull(row.own_tax_abs),
            ownAbsRegion: row.own_abs_region
                ? createRegionEntityFromPrisma(row.own_abs_region)
                : null,
        };
    }

    /** Регион с действующей для портала ценой: источник → ручной → общий */
    private toMergedRegion(row: PortalRegionRow): RegionEntity {
        const region = createRegionEntityFromPrisma(row.region);
        return { ...region, ...resolvePortalPrice(region, this.toLink(row)) };
    }
}
