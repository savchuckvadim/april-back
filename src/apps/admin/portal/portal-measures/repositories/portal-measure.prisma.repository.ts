import { Injectable } from '@nestjs/common';
import { portal_measure } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { PortalMeasureRepository } from './portal-measure.repository';

@Injectable()
export class PortalMeasurePrismaRepository implements PortalMeasureRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(portalMeasure: Partial<portal_measure>): Promise<portal_measure | null> {
        const result = await this.prisma.portal_measure.create({
            data: {
                measure_id: BigInt(portalMeasure.measure_id!),
                portal_id: BigInt(portalMeasure.portal_id!),
                bitrixId: portalMeasure.bitrixId,
                name: portalMeasure.name,
                shortName: portalMeasure.shortName,
                fullName: portalMeasure.fullName,
            },
            include: {
                measures: true,
                portals: true,
            },
        });
        return result;
    }

    async findById(id: number): Promise<portal_measure | null> {
        const result = await this.prisma.portal_measure.findUnique({
            where: { id: BigInt(id) },
            include: {
                measures: true,
                portals: true,
            },
        });
        return result;
    }

    async findMany(): Promise<portal_measure[] | null> {
        const result = await this.prisma.portal_measure.findMany({
            include: {
                measures: true,
                portals: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<portal_measure[] | null> {
        const result = await this.prisma.portal_measure.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                measures: true,
                portals: true,
            },
        });
        return result;
    }

    async findByMeasureId(measureId: number): Promise<portal_measure[] | null> {
        const result = await this.prisma.portal_measure.findMany({
            where: { measure_id: BigInt(measureId) },
            include: {
                measures: true,
                portals: true,
            },
        });
        return result;
    }

    async update(id: number, portalMeasure: Partial<portal_measure>): Promise<portal_measure | null> {
        const updateData: any = {};
        if (portalMeasure.measure_id !== undefined) updateData.measure_id = BigInt(portalMeasure.measure_id);
        if (portalMeasure.portal_id !== undefined) updateData.portal_id = BigInt(portalMeasure.portal_id);
        if (portalMeasure.bitrixId !== undefined) updateData.bitrixId = portalMeasure.bitrixId;
        if (portalMeasure.name !== undefined) updateData.name = portalMeasure.name;
        if (portalMeasure.shortName !== undefined) updateData.shortName = portalMeasure.shortName;
        if (portalMeasure.fullName !== undefined) updateData.fullName = portalMeasure.fullName;

        const result = await this.prisma.portal_measure.update({
            where: { id: BigInt(id) },
            data: updateData,
            include: {
                measures: true,
                portals: true,
            },
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.portal_measure.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

