import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { ProviderImageEntity } from './provider-image.entity';
import { ProviderImageRole } from './provider-image.role';
import {
    ProviderImageRepository,
    UpsertProviderImageData,
} from './provider-image.repository';
import { createProviderImageEntityFromPrisma } from './lib/provider-image-entity.util';

@Injectable()
export class ProviderImagePrismaRepository implements ProviderImageRepository {
    constructor(private readonly prisma: PrismaService) {}

    async rqExists(rqId: number): Promise<boolean> {
        const count = await this.prisma.rqs.count({
            where: { id: BigInt(rqId) },
        });
        return count > 0;
    }

    async findByRq(rqId: number): Promise<ProviderImageEntity[]> {
        const rows = await this.prisma.providerImage.findMany({
            where: { rqId: BigInt(rqId) },
            orderBy: { role: 'asc' },
        });
        return rows.flatMap(row => {
            const entity = createProviderImageEntityFromPrisma(row);
            return entity ? [entity] : [];
        });
    }

    async find(
        rqId: number,
        role: ProviderImageRole,
    ): Promise<ProviderImageEntity | null> {
        const row = await this.prisma.providerImage.findUnique({
            where: { rqId_role: { rqId: BigInt(rqId), role } },
        });
        return row ? createProviderImageEntityFromPrisma(row) : null;
    }

    async upsert(data: UpsertProviderImageData): Promise<ProviderImageEntity> {
        // У Laravel-таблицы нет значений по умолчанию для timestamps: без них
        // created_at/updated_at остаются NULL
        const now = new Date();
        const file = {
            path: data.path,
            format: data.format,
            width: data.width,
            height: data.height,
            size: data.size,
            originalName: data.originalName,
        };
        const row = await this.prisma.providerImage.upsert({
            where: { rqId_role: { rqId: BigInt(data.rqId), role: data.role } },
            create: {
                ...file,
                id: data.id,
                createdAt: now,
                updatedAt: now,
                rqId: BigInt(data.rqId),
                role: data.role,
                legacyFileId: data.legacyFileId ?? null,
            },
            update: {
                ...file,
                id: data.id,
                updatedAt: now,
                ...(data.legacyFileId === undefined
                    ? {}
                    : { legacyFileId: data.legacyFileId }),
            },
        });
        const entity = createProviderImageEntityFromPrisma(row);
        if (!entity) {
            throw new Error(
                `Запись картинки ${row.id} сохранена с неизвестной ролью или форматом`,
            );
        }
        return entity;
    }

    async delete(rqId: number, role: ProviderImageRole): Promise<boolean> {
        const { count } = await this.prisma.providerImage.deleteMany({
            where: { rqId: BigInt(rqId), role },
        });
        return count > 0;
    }
}
