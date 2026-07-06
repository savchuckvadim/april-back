import { PrismaService } from '@/core/prisma';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field/';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { bigintConvertToNumber } from '@/shared';
import { PortalListEntity } from './entity/portal-list.entity';
import type { PortalListRow } from './types/portal-list-row.type';
import { getPortalListEntity } from './utils/portal-list-entity.util';

/** Данные списка для upsert после ответа Bitrix `lists.add`/`lists.get` */
export interface PortalListUpsertData {
    type: string;
    group: string;
    name: string;
    title: string;
    bitrixId: number;
}

@Injectable()
export class PortalListService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly pbxFieldService: PbxFieldService,
        private readonly portalService: PortalStoreService,
    ) {}

    /** Строка из БД по порталу + type/group (как после инсталла). */
    async findFirstByPortalTypeGroup(
        portalId: bigint,
        type: string,
        group: string,
    ): Promise<PortalListRow | null> {
        return this.prisma.bitrixlists.findFirst({
            where: {
                portal_id: portalId,
                type,
                group,
            },
        });
    }

    /** Upsert строки списка после успешной установки в Bitrix. */
    async upsertFromBitrix(
        domain: string,
        data: PortalListUpsertData,
    ): Promise<PortalListRow> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = BigInt(portal.id.toString());
        const existing = await this.findFirstByPortalTypeGroup(
            portalId,
            data.type,
            data.group,
        );
        const updatedData = {
            name: data.name,
            title: data.title,
            bitrixId: BigInt(data.bitrixId),
        };
        if (!existing) {
            return this.prisma.bitrixlists.create({
                data: {
                    portal_id: portalId,
                    type: data.type,
                    group: data.group,
                    ...updatedData,
                },
            });
        }
        return this.prisma.bitrixlists.update({
            where: { id: existing.id },
            data: updatedData,
        });
    }

    async findRowByDomainAndKeys(
        domain: string,
        type: string,
        group: string,
    ): Promise<PortalListRow> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const row = await this.findFirstByPortalTypeGroup(
            BigInt(portal.id.toString()),
            type,
            group,
        );
        if (!row) {
            throw new NotFoundException('List not found');
        }
        return row;
    }

    async getListByDomainAndKeys(
        domain: string,
        type: string,
        group: string,
    ): Promise<PortalListEntity> {
        const row = await this.findRowByDomainAndKeys(domain, type, group);
        return this.buildListEntity(row);
    }

    async getListsByPortalDomain(domain: string) {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: {
                id: true,
                domain: true,
                bitrixlists: true,
            },
        });
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const lists = await Promise.all(
            portal.bitrixlists.map(async list => this.buildListEntity(list)),
        );
        return {
            id: bigintConvertToNumber(portal.id),
            domain: portal.domain,
            lists,
        };
    }

    /** Только строка `bitrixlists` (поля в БД не трогаются). */
    async deleteRowById(id: bigint): Promise<{ deletedId: number }> {
        await this.prisma.bitrixlists.delete({ where: { id } });
        return { deletedId: bigintConvertToNumber(id) };
    }

    /**
     * Удаление списка как при «откате инсталла»:
     * поля сущности BITRIX_LIST + строка списка.
     */
    async deleteListCascade(id: bigint): Promise<{ deleted: number }> {
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.BITRIX_LIST,
            id,
        );
        await this.prisma.bitrixlists.delete({ where: { id } });
        return { deleted: bigintConvertToNumber(id) };
    }

    private async buildListEntity(
        list: PortalListRow,
    ): Promise<PortalListEntity> {
        const fields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.BITRIX_LIST,
            list.id,
        );
        return getPortalListEntity(list, fields);
    }
}
