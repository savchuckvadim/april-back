import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { VendorSuperUser } from 'generated/prisma';
import {
    VendorSuperUserInput,
    VendorSuperUserRecord,
    VendorSuperUserRepository,
} from './vendor-super-user.repository';

/**
 * Prisma-реализация.
 *
 * `domain` в строке — дубль домена портала, чтобы горячий путь проверки прав
 * искал по домену из запроса без join. Дубль заполняется НЕ из аргумента, а
 * читается из самого портала: админка знает только его id, и так значение не
 * может разъехаться с порталом.
 */
@Injectable()
export class VendorSuperUserPrismaRepository extends VendorSuperUserRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async findActiveBitrixIdsByDomain(domain: string): Promise<number[]> {
        const rows = await this.prisma.vendorSuperUser.findMany({
            where: { domain, isActive: true },
            select: { bitrixId: true },
        });
        return rows.map(row => row.bitrixId);
    }

    async findByPortalId(portalId: number): Promise<VendorSuperUserRecord[]> {
        const rows = await this.prisma.vendorSuperUser.findMany({
            where: { portal_id: BigInt(portalId) },
            orderBy: { bitrixId: 'asc' },
        });
        return rows.map(row => this.toRecord(row));
    }

    async upsert(
        portalId: number,
        input: VendorSuperUserInput,
    ): Promise<VendorSuperUserRecord> {
        const domain = await this.domainOfPortal(portalId);
        const now = new Date();
        const row = await this.prisma.vendorSuperUser.upsert({
            where: {
                portal_id_bitrixId: {
                    portal_id: BigInt(portalId),
                    bitrixId: input.bitrixId,
                },
            },
            create: {
                id: randomUUID(),
                portal_id: BigInt(portalId),
                domain,
                bitrixId: input.bitrixId,
                comment: input.comment ?? null,
                isActive: input.isActive ?? true,
                createdAt: now,
                updatedAt: now,
            },
            update: {
                // Домен переписываем: портал мог сменить его после заведения.
                domain,
                comment: input.comment ?? null,
                ...(input.isActive === undefined
                    ? {}
                    : { isActive: input.isActive }),
                updatedAt: now,
            },
        });
        return this.toRecord(row);
    }

    async remove(portalId: number, bitrixId: number): Promise<string | null> {
        // Читаем домен ДО удаления: после него взять его будет негде, а по
        // нему вызывающий сбрасывает кэш прав.
        const row = await this.prisma.vendorSuperUser.findUnique({
            where: {
                portal_id_bitrixId: {
                    portal_id: BigInt(portalId),
                    bitrixId,
                },
            },
            select: { domain: true },
        });
        if (!row) return null;
        await this.prisma.vendorSuperUser.delete({
            where: {
                portal_id_bitrixId: {
                    portal_id: BigInt(portalId),
                    bitrixId,
                },
            },
        });
        return row.domain;
    }

    /** Домен портала — для дубля в строке. Нет портала: нечего заводить. */
    private async domainOfPortal(portalId: number): Promise<string> {
        const portal = await this.prisma.portal.findUnique({
            where: { id: BigInt(portalId) },
            select: { domain: true },
        });
        const domain = portal?.domain?.trim();
        if (!domain) {
            throw new NotFoundException(
                `Портал ${portalId} не найден или у него не задан домен`,
            );
        }
        return domain.toLowerCase();
    }

    private toRecord(row: VendorSuperUser): VendorSuperUserRecord {
        return {
            id: row.id,
            portalId: Number(row.portal_id),
            domain: row.domain,
            bitrixId: row.bitrixId,
            comment: row.comment,
            isActive: row.isActive,
        };
    }
}
