import { Injectable } from '@nestjs/common';
import { timezones } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { TimezoneRepository } from './timezone.repository';

@Injectable()
export class TimezonePrismaRepository implements TimezoneRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(timezone: Partial<timezones>): Promise<timezones | null> {
        const result = await this.prisma.timezones.create({
            data: {
                name: timezone.name!,
                title: timezone.title!,
                value: timezone.value!,
                portal_id: BigInt(timezone.portal_id!),
                type: timezone.type,
                offset: timezone.offset,
            },
        });
        return result;
    }

    async findById(id: number): Promise<timezones | null> {
        const result = await this.prisma.timezones.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findMany(): Promise<timezones[] | null> {
        const result = await this.prisma.timezones.findMany({
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<timezones[] | null> {
        const result = await this.prisma.timezones.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async update(id: number, timezone: Partial<timezones>): Promise<timezones | null> {
        const updateData: any = {};
        if (timezone.name !== undefined) updateData.name = timezone.name;
        if (timezone.title !== undefined) updateData.title = timezone.title;
        if (timezone.value !== undefined) updateData.value = timezone.value;
        if (timezone.portal_id !== undefined) updateData.portal_id = BigInt(timezone.portal_id);
        if (timezone.type !== undefined) updateData.type = timezone.type;
        if (timezone.offset !== undefined) updateData.offset = timezone.offset;

        const result = await this.prisma.timezones.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.timezones.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

