import { PrismaService } from '@/core';
import { PbxUserRepository } from './pbx-user.repository';
import { PbxUserEntity } from '../entity/pbx-user.entity';
import { mapToEntity } from '../utils/map-to-entity.util';
import { PbxFieldEntity, PbxFieldService } from '../../field';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PbxUserPrismaRepository implements PbxUserRepository {
    constructor(
        private readonly prisma: PrismaService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}
    private async getFields(id: string): Promise<PbxFieldEntity[]> {
        return (
            (await this.pbxFieldService.findByEntityId(
                PbxEntityTypePrisma.USER,
                BigInt(id),
            )) || []
        );
    }
    async findById(id: string): Promise<PbxUserEntity | null> {
        const user = await this.prisma.btxUser.findUnique({
            where: { id: BigInt(id) },
        });
        if (!user) return null;
        const fields = await this.getFields(id);
        return mapToEntity(user, fields);
    }
    async findByBitrixId(id: string): Promise<PbxUserEntity | null> {
        const user = await this.prisma.btxUser.findUnique({
            where: { id: BigInt(id) },
            include: {
                portals: true,
            },
        });
        if (!user) return null;
        const fields = await this.getFields(id);
        return mapToEntity(user, fields);
    }
    async findByPortalId(portalId: string): Promise<PbxUserEntity | null> {
        const user = await this.prisma.btxUser.findFirst({
            where: { portal_id: BigInt(portalId) },
        });
        if (!user) return null;
        const fields = await this.getFields(user.id.toString());
        return mapToEntity(user, fields);
    }
    async findByPortalDomain(
        portalDomain: string,
    ): Promise<PbxUserEntity | null> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain: portalDomain },
            include: {
                btx_users: true,
            },
        });
        if (!portal) return null;
        const user = portal.btx_users[0];
        if (!user) return null;
        const fields = await this.getFields(user.id.toString());
        return mapToEntity(user, fields);
    }
    async findAll(): Promise<PbxUserEntity[] | null> {
        const users = await this.prisma.btxUser.findMany();

        if (!users) return null;

        const usersResult: PbxUserEntity[] = [];
        for (const user of users) {
            const fields = await this.getFields(user.id.toString());
            usersResult.push(mapToEntity(user, fields));
        }
        return usersResult || [];
    }
    async create(
        user: Partial<Omit<PbxUserEntity, 'id' | 'createdAt' | 'updatedAt'>>,
        portalId: string,
    ): Promise<PbxUserEntity | null> {
        const newUser = await this.prisma.btxUser.create({
            data: {
                ...user,
                portal_id: BigInt(portalId),
                created_at: new Date(),
                updated_at: new Date(),
                code: user.code || 'bx-user',
            },
            include: {
                portals: true,
            },
        });
        const fields = await this.getFields(newUser.id.toString());
        return mapToEntity(newUser, fields);
    }
    async update(
        id: string,
        user: Partial<Omit<PbxUserEntity, 'id' | 'createdAt' | 'updatedAt'>>,
    ): Promise<PbxUserEntity | null> {
        const updatedUser = await this.prisma.btxUser.update({
            where: { id: BigInt(id) },
            data: {
                ...user,
                updated_at: new Date(),
            },
            include: {
                portals: true,
            },
        });
        const fields = await this.getFields(updatedUser.id.toString());
        return mapToEntity(updatedUser, fields);
    }
    async delete(id: string): Promise<boolean> {
        await this.prisma.btxUser.delete({ where: { id: BigInt(id) } });
        return true;
    }
}
