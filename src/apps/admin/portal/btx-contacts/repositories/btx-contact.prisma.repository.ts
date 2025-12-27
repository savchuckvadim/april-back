import { Injectable } from '@nestjs/common';
import { btx_contacts } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { BtxContactRepository } from './btx-contact.repository';

@Injectable()
export class BtxContactPrismaRepository implements BtxContactRepository {
    constructor(private readonly prisma: PrismaService) {}

    async create(contact: Partial<btx_contacts>): Promise<btx_contacts | null> {
        const result = await this.prisma.btx_contacts.create({
            data: {
                name: contact.name!,
                title: contact.title!,
                code: contact.code!,
                portal_id: BigInt(contact.portal_id!),
            },
        });
        return result;
    }

    async findById(id: number): Promise<btx_contacts | null> {
        const result = await this.prisma.btx_contacts.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findMany(): Promise<btx_contacts[] | null> {
        const result = await this.prisma.btx_contacts.findMany({
            include: {
                portals: true,
            },
        });
        return result;
    }

    async findByPortalId(portalId: number): Promise<btx_contacts[] | null> {
        const result = await this.prisma.btx_contacts.findMany({
            where: { portal_id: BigInt(portalId) },
            include: {
                portals: true,
            },
        });
        return result;
    }

    async update(id: number, contact: Partial<btx_contacts>): Promise<btx_contacts | null> {
        const updateData: any = {};
        if (contact.name !== undefined) updateData.name = contact.name;
        if (contact.title !== undefined) updateData.title = contact.title;
        if (contact.code !== undefined) updateData.code = contact.code;
        if (contact.portal_id !== undefined) updateData.portal_id = BigInt(contact.portal_id);

        const result = await this.prisma.btx_contacts.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.btx_contacts.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

