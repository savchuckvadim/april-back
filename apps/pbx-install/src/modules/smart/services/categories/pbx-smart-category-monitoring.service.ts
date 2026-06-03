import { Injectable, NotFoundException } from '@nestjs/common';
import { BitrixService, IBXStatus } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    BtxCategoryResponseDto,
    BtxCategoryService,
    BtxStageResponseDto,
} from '@/modules/pbx-domain/category';
import { PortalSmartService } from '@/modules/pbx-domain/portal-smart';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { PbxEntityType } from '@/shared/enums';
import {
    BxCategoryRow,
    normalizeStatusListResult,
} from '@/modules/pbx-install/shared/utils/bitrix-category-stage.utils';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';
import { SmartCategoryStageStrategy } from '../smart-categories/smart-category-stage.strategy';

/** Категория из Bitrix вместе с её стадиями. */
export interface BxSmartCategoryWithStages {
    id: number;
    name: string;
    code: string;
    isDefault: 'Y' | 'N';
    sort?: number;
    stages: IBXStatus[];
}

/** Стадия в составе merged-категории смарта: портал ↔ Bitrix. */
export interface PbxSmartMergedStage {
    /** Ключ сопоставления — `bitrixId` (`NEW`, `WON`, ...) без префикса воронки. */
    bitrixId: string;
    p: BtxStageResponseDto | null;
    bx: IBXStatus | null;
}

/** Одна категория смарта в monitoring-выдаче: портал ↔ Bitrix ↔ стадии. */
export interface PbxSmartMergedCategory {
    /** Ключ сопоставления (`code` шаблона; fallback — `bitrixId`). */
    key: string;
    p: BtxCategoryResponseDto | null;
    bx: BxSmartCategoryWithStages | null;
    mergedStages: PbxSmartMergedStage[];
    portalStagesWithoutMerged: BtxStageResponseDto[];
    bitrixStagesWithoutMerged: IBXStatus[];
}

/** Полная сводка по категориям одного смарта на портале: смерженные + хвосты. */
export interface PbxSmartCategoryMonitoringResult {
    mergedCategories: PbxSmartMergedCategory[];
    portalCategoriesWithoutMerged: BtxCategoryResponseDto[];
    bitrixCategoriesWithoutMerged: BxSmartCategoryWithStages[];
}

/**
 * Сводка категорий и стадий конкретного смарта: портал-БД (`btx_categories` + `btx_stages`)
 * против Bitrix (`crm.category.list(<entityTypeId>)` + `crm.status.list`).
 *
 * Аналог {@link PbxDealCategoryMonitoringService}, только адресует смарт по
 * `(domain, smartName, group)` (на портале может быть много смартов).
 * Для смартов синтетической default-воронки нет — у Bitrix всё через `crm.category.list`.
 */
@Injectable()
export class PbxSmartCategoryMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly categoryService: BtxCategoryService,
        private readonly strategy: SmartCategoryStageStrategy,
    ) {}

    async getPbxSmartCategoriesByDomain(
        domain: string,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
    ): Promise<PbxSmartCategoryMonitoringResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const smart = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portal.id),
            smartName,
            group,
        );
        if (!smart) {
            throw new NotFoundException(
                `Smart not installed for ${smartName}/${group}`,
            );
        }
        const entityTypeId = Number(smart.entityTypeId);
        const smartDbId = Number(smart.id);

        const portalCategories = await this.categoryService.findByEntity(
            PbxEntityType.SMART,
            smartDbId,
        );
        const bxCategories = await this.loadBitrixCategoriesWithStages(
            bitrix,
            entityTypeId,
        );

        const merged: PbxSmartMergedCategory[] = [];
        const matchedBxIds = new Set<number>();

        for (const p of portalCategories) {
            const bx = bxCategories.find(b => matchCategory(p, b)) ?? null;
            if (bx) matchedBxIds.add(bx.id);
            merged.push(buildMergedCategory(p, bx));
        }
        for (const bx of bxCategories) {
            if (matchedBxIds.has(bx.id)) continue;
            merged.push(buildMergedCategory(null, bx));
        }

        const portalCategoriesWithoutMerged = portalCategories.filter(
            p => !merged.some(m => m.p?.id === p.id),
        );
        const bitrixCategoriesWithoutMerged = bxCategories.filter(
            b => !merged.some(m => m.bx?.id === b.id),
        );

        return {
            mergedCategories: merged,
            portalCategoriesWithoutMerged,
            bitrixCategoriesWithoutMerged,
        };
    }

    async getPbxSmartCategoriesByCodes(
        domain: string,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
        codes: string[],
    ): Promise<PbxSmartMergedCategory[]> {
        if (codes.length === 0) return [];
        const all = await this.getPbxSmartCategoriesByDomain(
            domain,
            smartName,
            group,
        );
        const wanted = new Set(codes.map(c => normalizeKey(c)));
        return all.mergedCategories.filter(m =>
            wanted.has(normalizeKey(m.key)),
        );
    }

    private async loadBitrixCategoriesWithStages(
        bitrix: BitrixService,
        entityTypeId: number,
    ): Promise<BxSmartCategoryWithStages[]> {
        const entityTypeIdStr = String(entityTypeId);
        const res = await bitrix.category.getList(entityTypeIdStr);
        const list = (res.result?.categories ?? []) as BxCategoryRow[];

        const out: BxSmartCategoryWithStages[] = [];
        for (const row of list) {
            const id = Number(row.id);
            const entityId = this.strategy.statusEntityId(entityTypeId, id);
            const stages = await this.fetchStages(bitrix, entityId);
            out.push({
                id,
                name: String(row.name ?? ''),
                code: String(row.code ?? ''),
                isDefault: row.isDefault ?? 'N',
                sort: row.sort,
                stages,
            });
        }
        return out;
    }

    private async fetchStages(
        bitrix: BitrixService,
        entityId: string,
    ): Promise<IBXStatus[]> {
        const list = await bitrix.status.getList({ ENTITY_ID: entityId });
        return normalizeStatusListResult(list.result);
    }
}

function normalizeKey(v: unknown): string {
    return String(v ?? '')
        .trim()
        .toLowerCase();
}

function matchCategory(
    p: BtxCategoryResponseDto,
    bx: BxSmartCategoryWithStages,
): boolean {
    if (p.code && bx.code && normalizeKey(p.code) === normalizeKey(bx.code)) {
        return true;
    }
    return normalizeKey(p.bitrixId) === normalizeKey(bx.id);
}

function buildMergedCategory(
    p: BtxCategoryResponseDto | null,
    bx: BxSmartCategoryWithStages | null,
): PbxSmartMergedCategory {
    const portalStages = p?.stages ?? [];
    const bitrixStages = bx?.stages ?? [];

    const mergedStages: PbxSmartMergedStage[] = [];
    const usedBxStatusIds = new Set<string>();

    for (const ps of portalStages) {
        const bs =
            bitrixStages.find(
                s => statusIdSuffix(s.STATUS_ID) === normalizeKey(ps.bitrixId),
            ) ?? null;
        if (bs?.STATUS_ID) usedBxStatusIds.add(bs.STATUS_ID);
        mergedStages.push({ bitrixId: ps.bitrixId, p: ps, bx: bs });
    }
    for (const bs of bitrixStages) {
        if (!bs.STATUS_ID || usedBxStatusIds.has(bs.STATUS_ID)) continue;
        mergedStages.push({
            bitrixId: statusIdSuffix(bs.STATUS_ID),
            p: null,
            bx: bs,
        });
    }

    const portalStagesWithoutMerged = portalStages.filter(
        ps => !mergedStages.some(m => m.p?.id === ps.id),
    );
    const bitrixStagesWithoutMerged = bitrixStages.filter(
        bs => !mergedStages.some(m => m.bx?.STATUS_ID === bs.STATUS_ID),
    );

    return {
        key: p?.code || (bx?.code ?? String(bx?.id ?? p?.bitrixId ?? '')),
        p,
        bx,
        mergedStages,
        portalStagesWithoutMerged,
        bitrixStagesWithoutMerged,
    };
}

/** Smart STATUS_ID = `DT<entityTypeId>_<bxCategoryId>:<bitrixId>` — выдёргиваем суффикс. */
function statusIdSuffix(statusId: string | undefined): string {
    if (!statusId) return '';
    const idx = statusId.lastIndexOf(':');
    return normalizeKey(idx >= 0 ? statusId.slice(idx + 1) : statusId);
}
