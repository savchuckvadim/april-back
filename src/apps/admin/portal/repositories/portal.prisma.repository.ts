import { Injectable } from '@nestjs/common';
import { Portal } from 'generated/prisma';
import { PrismaService } from '@/core/prisma';
import { AdminPortalRepository } from './portal.repository';

@Injectable()
export class AdminPortalPrismaRepository implements AdminPortalRepository {
    constructor(private readonly prisma: PrismaService) { }

    async create(portal: Partial<Portal>): Promise<Portal | null> {
        const result = await this.prisma.portal.create({
            data: {
                domain: portal.domain,
                key: portal.key,
                C_REST_CLIENT_ID: portal.C_REST_CLIENT_ID,
                C_REST_CLIENT_SECRET: portal.C_REST_CLIENT_SECRET,
                C_REST_WEB_HOOK_URL: portal.C_REST_WEB_HOOK_URL,
                number: portal.number ?? 0,
                client_id: portal.client_id ? BigInt(portal.client_id) : null,
            },
        });
        return result;
    }

    async findById(id: number): Promise<Portal | null> {
        const result = await this.prisma.portal.findUnique({
            where: { id: BigInt(id) },
            include: {
                clients: true,
            },
        });
        return result;
    }

    async findMany(): Promise<Portal[] | null> {
        const result = await this.prisma.portal.findMany({
            include: {
                clients: true,
            },
        });
        return result;
    }

    async findByDomain(domain: string): Promise<Portal | null> {
        const result = await this.prisma.portal.findFirst({
            where: { domain: domain },
            include: {
                clients: true,
            },
        });
        return result;
    }

    async findByClientId(clientId: number): Promise<Portal[] | null> {
        const result = await this.prisma.portal.findMany({
            where: { client_id: BigInt(clientId) },
            include: {
                clients: true,
            },
        });
        return result;
    }

    async update(id: number, portal: Partial<Portal>): Promise<Portal | null> {
        const updateData: any = {};
        if (portal.domain !== undefined) updateData.domain = portal.domain;
        if (portal.key !== undefined) updateData.key = portal.key;
        if (portal.C_REST_CLIENT_ID !== undefined) updateData.C_REST_CLIENT_ID = portal.C_REST_CLIENT_ID;
        if (portal.C_REST_CLIENT_SECRET !== undefined) updateData.C_REST_CLIENT_SECRET = portal.C_REST_CLIENT_SECRET;
        if (portal.C_REST_WEB_HOOK_URL !== undefined) updateData.C_REST_WEB_HOOK_URL = portal.C_REST_WEB_HOOK_URL;
        if (portal.number !== undefined) updateData.number = portal.number;
        if (portal.client_id !== undefined) updateData.client_id = portal.client_id ? BigInt(portal.client_id) : null;

        const result = await this.prisma.portal.update({
            where: { id: BigInt(id) },
            data: updateData,
        });
        return result;
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.prisma.portal.delete({
            where: { id: BigInt(id) },
        });
        return result ? true : false;
    }
}

