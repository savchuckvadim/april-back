import { PrismaService } from '@/core/prisma';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field';
import {
    BtxCategoryRepository,
    PortalCategoryEntity,
} from '@lib/portal-lib/pbx-domain/category';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { bigintConvertToNumber } from '@/shared';
import { IBxRpaType } from '@/modules/bitrix';
import { getPortalRpaEntity } from './utils/portal-rpa-entity.util';
import { PortalRpaEntity } from './entity/portal-rpa.entity';
import type { PortalRpaRow } from './types/portal-rpa-row.type';

/**
 * Доступ к зеркалу RPA-процессов портала в PortalDB (`btx_rpas`).
 *
 * Идейно повторяет {@link PortalSmartService}, но:
 * - таблица `btx_rpas` не имеет колонки `group` — RPA на портале уникален по `code` (= `rpaName`);
 * - у RPA ровно одна «категория»/воронка (зеркалится в `btx_categories` отдельным сервисом установки).
 */
@Injectable()
export class PortalRpaService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly pbxFieldService: PbxFieldService,
        private readonly portalService: PortalStoreService,
        private readonly categoryRepository: BtxCategoryRepository,
    ) {}

    /** Строка из БД по порталу + `code` (= имя RPA из URL установки). */
    async findFirstByPortalAndCode(
        portalId: bigint,
        code: string,
    ): Promise<PortalRpaRow | null> {
        return this.prisma.btx_rpas.findFirst({
            where: { portal_id: portalId, code },
        });
    }

    /**
     * Upsert строки `btx_rpas` после успешного ответа Bitrix `rpa.type.add/get`.
     * Возвращает строку (нужна для резолва полей и зеркала категории/стадий).
     */
    async upsertFromBitrix(
        domain: string,
        bxRpaType: IBxRpaType,
        rpaName: string,
        group: string,
    ): Promise<PortalRpaRow> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = BigInt(portal.id);
        const typeId = Number(bxRpaType.id);
        const existing = await this.findFirstByPortalAndCode(portalId, rpaName);

        const updatedData = {
            name: bxRpaType.name ?? bxRpaType.title,
            title: bxRpaType.title,
            type: group,
            typeId: String(typeId),
            bitrixId: BigInt(typeId),
            entityTypeId: BigInt(typeId),
            image: bxRpaType.image ?? null,
            updated_at: new Date(),
        };

        if (!existing) {
            return this.prisma.btx_rpas.create({
                data: {
                    portal_id: portalId,
                    code: rpaName,
                    created_at: new Date(),
                    ...updatedData,
                },
            });
        }
        return this.prisma.btx_rpas.update({
            where: { id: existing.id },
            data: updatedData,
        });
    }

    /** Агрегат всех RPA портала (rpa + единственная категория + поля). */
    async getRpasByPortalDomain(domain: string): Promise<{
        domain: string;
        portalId: number;
        rpas: PortalRpaEntity[];
    }> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: { id: true, btx_rpas: true },
        });
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const rpas = await Promise.all(
            portal.btx_rpas.map(rpa => this.buildRpaEntity(rpa)),
        );
        return {
            domain,
            portalId: bigintConvertToNumber(portal.id),
            rpas,
        };
    }

    /** Один RPA портала по `code` (= rpaName). */
    async getRpaByPortalAndCode(
        domain: string,
        code: string,
    ): Promise<PortalRpaEntity> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const rpa = await this.findFirstByPortalAndCode(
            BigInt(portal.id),
            code,
        );
        if (!rpa) {
            throw new NotFoundException(`RPA not found for code=${code}`);
        }
        return this.buildRpaEntity(rpa);
    }

    /** Удаление как при «откате инсталла»: поля + категория(и) + строка rpa. */
    async deleteRpaCascade(id: bigint): Promise<{ deleted: number }> {
        await this.pbxFieldService.deleteFieldsByEntityId(
            PbxEntityTypePrisma.BTX_RPA,
            id,
        );
        const categories = await this.categoryRepository.findByEntity(
            PbxEntityTypePrisma.BTX_RPA,
            bigintConvertToNumber(id),
        );
        for (const category of categories ?? []) {
            await this.categoryRepository.delete(category.id);
        }
        await this.prisma.btx_rpas.delete({ where: { id } });
        return { deleted: bigintConvertToNumber(id) };
    }

    private async buildRpaEntity(rpa: PortalRpaRow): Promise<PortalRpaEntity> {
        const category = await this.getRpaCategory(rpa.id);
        const fields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.BTX_RPA,
            rpa.id,
        );
        return getPortalRpaEntity(rpa, category, fields);
    }

    private async getRpaCategory(
        rpaId: bigint,
    ): Promise<PortalCategoryEntity | null> {
        const categories = await this.categoryRepository.findByEntity(
            PbxEntityTypePrisma.BTX_RPA,
            bigintConvertToNumber(rpaId),
        );
        return categories?.[0] ?? null;
    }
}
