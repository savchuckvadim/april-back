import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/core/prisma";
import { RegionRepository } from "./region.repository";
import { RegionEntity } from "./region.entity";
import { createRegionEntityFromPrisma } from "./lib/region-entity.util";

@Injectable()
export class RegionPrismaRepository implements RegionRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

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
                    updated_at: now
                }
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
                    updated_at: new Date()
                }
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
                where: { id: BigInt(id) }
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
                where: { code }
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
                where: { code: { in: codes } }
            });
            if (!result) return null;
            return result.map(region => createRegionEntityFromPrisma(region));
        } catch (error) {
            console.error('Error finding regions by codes:', error);
            return null;
        }
    }
} 