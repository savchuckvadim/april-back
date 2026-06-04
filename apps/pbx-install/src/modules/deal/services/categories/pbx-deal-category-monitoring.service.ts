import { Injectable, NotFoundException } from '@nestjs/common';
import { BitrixOwnerTypeId, BitrixService, IBXStatus } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    BtxCategoryResponseDto,
    BtxCategoryService,
    BtxStageResponseDto,
} from '@/modules/pbx-domain/category';
import { PortalDealService } from '@/modules/pbx-domain';
import { PortalStoreService } from '@lib/portal-konstructor/portal/portal-store.service';
import { PbxEntityType } from '@/shared/enums';
import {
    BxCategoryRow,
    normalizeStatusListResult,
} from '@app/pbx-install/shared/utils/bitrix-category-stage.utils';
import { DealCategoryStageStrategy } from './deal-category-stage.strategy';

/** Категория из Bitrix вместе с её стадиями. */
export interface BxCategoryWithStages {
    id: number;
    name: string;
    code: string;
    isDefault: 'Y' | 'N';
    sort?: number;
    stages: IBXStatus[];
}

/** Стадия в составе merged-категории: портал ↔ Bitrix. */
export interface PbxDealMergedStage {
    /** Ключ сопоставления — `bitrixId` (`NEW`, `WON`, ...) без префикса воронки. */
    bitrixId: string;
    p: BtxStageResponseDto | null;
    bx: IBXStatus | null;
}

/** Одна категория сделки в monitoring-выдаче: портал ↔ Bitrix ↔ стадии. */
export interface PbxDealMergedCategory {
    /** Ключ сопоставления (`code` шаблона; fallback — `bitrixId`). */
    key: string;
    p: BtxCategoryResponseDto | null;
    bx: BxCategoryWithStages | null;
    mergedStages: PbxDealMergedStage[];
    portalStagesWithoutMerged: BtxStageResponseDto[];
    bitrixStagesWithoutMerged: IBXStatus[];
}

/** Полная сводка по категориям сделки портала: смерженные + хвосты с обеих сторон. */
export interface PbxDealCategoryMonitoringResult {
    mergedCategories: PbxDealMergedCategory[];
    portalCategoriesWithoutMerged: BtxCategoryResponseDto[];
    bitrixCategoriesWithoutMerged: BxCategoryWithStages[];
}

/**
 * Сводка категорий и стадий сделки на портале: портал-БД (`btx_categories` + `btx_stages`)
 * против Bitrix (`crm.category.list` + `crm.status.list`).
 *
 * Аналог {@link PbxDealMonitoringService}, только для категорий/стадий вместо полей.
 * Дефолтная воронка сделки (`bxCategoryId = 0`) не возвращается `crm.category.list`,
 * её стадии берём отдельно из `ENTITY_ID = DEAL_STAGE` и собираем синтетическую запись.
 */
@Injectable()
export class PbxDealCategoryMonitoringService {
    private readonly entityTypeId = BitrixOwnerTypeId.DEAL;

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalDealService: PortalDealService,
        private readonly categoryService: BtxCategoryService,
        private readonly strategy: DealCategoryStageStrategy,
    ) {}

    async getPbxDealCategoriesByDomain(
        domain: string,
    ): Promise<PbxDealCategoryMonitoringResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const portalCategories = await this.loadPortalCategories(domain);
        const bxCategories = await this.loadBitrixCategoriesWithStages(bitrix);

        const merged: PbxDealMergedCategory[] = [];
        const matchedPortalIds = new Set<number>();
        const matchedBxIds = new Set<number>();

        for (const p of portalCategories) {
            const bx = bxCategories.find(b => matchCategory(p, b)) ?? null;
            if (bx) {
                matchedBxIds.add(bx.id);
            }
            matchedPortalIds.add(p.id);
            merged.push(buildMergedCategory(p, bx));
        }

        // Bitrix-категории без зеркала в портальной БД: всё равно показываем, со стороны bx.
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

    /**
     * Точечная выборка: те же мерджи, но только по списку кодов из шаблона.
     * Удобно использовать поверх parsed-данных в search-эндпоинте.
     */
    async getPbxDealCategoriesByCodes(
        domain: string,
        codes: string[],
    ): Promise<PbxDealMergedCategory[]> {
        if (codes.length === 0) return [];
        const all = await this.getPbxDealCategoriesByDomain(domain);
        const wanted = new Set(codes.map(c => normalizeKey(c)));
        return all.mergedCategories.filter(m =>
            wanted.has(normalizeKey(m.key)),
        );
    }

    private async loadPortalCategories(
        domain: string,
    ): Promise<BtxCategoryResponseDto[]> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalDeal = await this.portalDealService.findByPortalId(
            Number(portal.id),
        );
        if (!portalDeal) {
            throw new NotFoundException('Portal deal not found');
        }
        return this.categoryService.findByEntity(
            PbxEntityType.DEAL,
            Number(portalDeal.id),
        );
    }

    private async loadBitrixCategoriesWithStages(
        bitrix: BitrixService,
    ): Promise<BxCategoryWithStages[]> {
        const entityTypeIdStr = String(this.entityTypeId);
        const res = await bitrix.category.getList(entityTypeIdStr);
        const list = (res.result?.categories ?? []) as BxCategoryRow[];

        const out: BxCategoryWithStages[] = [];
        for (const row of list) {
            const id = Number(row.id);
            const entityId = this.strategy.statusEntityId(
                this.entityTypeId,
                id,
            );
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

        // Синтетическая запись для default-воронки (bxCategoryId = 0) — в crm.category.list её нет,
        // но её стадии существуют в Bitrix через ENTITY_ID = DEAL_STAGE.
        const defaultEntityId = this.strategy.statusEntityId(
            this.entityTypeId,
            0,
        );
        const defaultStages = await this.fetchStages(bitrix, defaultEntityId);
        out.unshift({
            id: 0,
            name: '(default)',
            code: '',
            isDefault: 'Y',
            stages: defaultStages,
        });

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
    if (typeof v === 'string') {
        return v.trim().toLowerCase();
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
        return String(v).trim().toLowerCase();
    }
    return '';
}

function matchCategory(
    p: BtxCategoryResponseDto,
    bx: BxCategoryWithStages,
): boolean {
    if (p.code && bx.code && normalizeKey(p.code) === normalizeKey(bx.code)) {
        return true;
    }
    return normalizeKey(p.bitrixId) === normalizeKey(bx.id);
}

function buildMergedCategory(
    p: BtxCategoryResponseDto | null,
    bx: BxCategoryWithStages | null,
): PbxDealMergedCategory {
    const portalStages = p?.stages ?? [];
    const bitrixStages = bx?.stages ?? [];

    const mergedStages: PbxDealMergedStage[] = [];
    const usedBxStatusIds = new Set<string>();

    for (const ps of portalStages) {
        const bs =
            bitrixStages.find(
                s => statusIdSuffix(s.STATUS_ID) === normalizeKey(ps.bitrixId),
            ) ?? null;
        if (bs?.STATUS_ID) {
            usedBxStatusIds.add(bs.STATUS_ID);
        }
        mergedStages.push({
            bitrixId: ps.bitrixId,
            p: ps,
            bx: bs,
        });
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

/** Из `C12:NEW` или `NEW` выделить суффикс `NEW`. */
function statusIdSuffix(statusId: string | undefined): string {
    if (!statusId) return '';
    const idx = statusId.lastIndexOf(':');
    return normalizeKey(idx >= 0 ? statusId.slice(idx + 1) : statusId);
}
