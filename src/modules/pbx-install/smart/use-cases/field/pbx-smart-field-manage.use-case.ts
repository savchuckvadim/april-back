import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntity, PbxFieldService } from '@/modules/pbx-domain';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import {
    BxTypedEntityFieldManageService,
    BxTypedFieldDeleteResult,
    BxTypedFieldItemOperationResult,
    DeleteTypedEntityFieldItemDto,
    DeleteTypedEntityFieldsDto,
    EditTypedEntityFieldItemDto,
    MANAGE_DOMAIN_ALL,
} from '@/modules/pbx-install/shared';
import {
    SmartContext,
    SmartContextResolver,
} from '../../services/smart-context.resolver';

type ResolvedSmartContext = Pick<
    SmartContext,
    'owner' | 'bxCtx' | 'smartBitrixTypeId'
> & {
    smartDbId: number;
    portalId: number;
};

interface PerPortalDeleteResult {
    domain: string;
    portalId: number;
    bx: BxTypedFieldDeleteResult[];
    deletedDbFieldIds: string[];
    notFoundCodes: string[];
}

interface PerPortalItemResult {
    domain: string;
    portalId: number;
    bx: BxTypedFieldItemOperationResult;
    db: { ok: boolean; itemId?: string; error?: string };
}

/**
 * Manage-операции над полями конкретного смарта Bitrix-портала.
 *
 * Зеркало `PbxDealFieldManageUseCase`, только:
 * - адресация — `(domain, smartName, group)` вместо просто `domain`;
 * - Bitrix-side — `BxTypedEntityFieldManageService` (через `userfieldconfig.*`);
 * - в БД портал-`entity_type` — `SMART`, `entity_id` — `smarts.id`.
 *
 * `domain === 'all'` поддерживается так же, как у deal/company: операция повторяется
 * по всем порталам, где у этого `(type, group)` есть смарт.
 */
@Injectable()
export class PbxSmartFieldManageUseCase {
    private readonly logger = new Logger(PbxSmartFieldManageUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly resolver: SmartContextResolver,
        private readonly pbxFieldService: PbxFieldService,
    ) { }

    async deleteFields(
        dto: DeleteTypedEntityFieldsDto,
    ): Promise<PerPortalDeleteResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const out: PerPortalDeleteResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolveSafe(domain, dto.type, dto.group);
            if (!ctx) continue;
            const dbFields = await this.pbxFieldService.findByEntityIdAndCodes(
                PbxEntityTypePrisma.SMART,
                BigInt(ctx.smartDbId),
                dto.codes,
            );
            const notFoundCodes = dto.codes.filter(
                c => !dbFields.some(f => f.code === c),
            );
            const bxFieldNames = dbFields.map(f => ({
                code: f.code,
                bxFieldName: f.bitrixId,
            }));
            const manage = new BxTypedEntityFieldManageService(
                domain,
                this.pbxService,
                ctx.bxCtx,
            );
            const bx = await manage.deleteFields(bxFieldNames);
            const deletedDbFieldIds = await this.deleteDbFields(dbFields, bx);
            out.push({
                domain,
                portalId: ctx.portalId,
                bx,
                deletedDbFieldIds,
                notFoundCodes,
            });
        }
        return out;
    }

    async deleteFieldItem(
        dto: DeleteTypedEntityFieldItemDto,
    ): Promise<PerPortalItemResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const out: PerPortalItemResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolveSafe(domain, dto.type, dto.group);
            if (!ctx) continue;
            const dbField = await this.findDbField(
                ctx.smartDbId,
                dto.fieldCode,
            );
            if (!dbField) {
                out.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItem(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'field not found in PortalDB' },
                });
                continue;
            }
            const dbItem = dbField.items.find(i => i.code === dto.itemCode);
            if (!dbItem) {
                out.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItem(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'list item not found in PortalDB' },
                });
                continue;
            }
            if (!dbItem.bitrixId) {
                out.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItem(
                        dto.fieldCode,
                        dto.itemCode,
                        'item has no bitrixId in PortalDB — not synced with Bitrix yet',
                    ),
                    db: { ok: false, error: 'item has no bitrixId in PortalDB' },
                });
                continue;
            }
            const manage = new BxTypedEntityFieldManageService(
                domain,
                this.pbxService,
                ctx.bxCtx,
            );
            const bx = await manage.deleteFieldItem(
                dbField.bitrixId,
                dbItem.bitrixId,
                { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
            );
            const db = await this.safeDeleteDbItem(dbItem.id);
            out.push({ domain, portalId: ctx.portalId, bx, db });
        }
        return out;
    }

    async editFieldItem(
        dto: EditTypedEntityFieldItemDto,
    ): Promise<PerPortalItemResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const out: PerPortalItemResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolveSafe(domain, dto.type, dto.group);
            if (!ctx) continue;
            const dbField = await this.findDbField(
                ctx.smartDbId,
                dto.fieldCode,
            );
            if (!dbField) {
                out.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItem(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'field not found in PortalDB' },
                });
                continue;
            }
            const dbItem = dbField.items.find(i => i.code === dto.itemCode);
            if (!dbItem) {
                out.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItem(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'list item not found in PortalDB' },
                });
                continue;
            }
            if (!dbItem.bitrixId) {
                out.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItem(
                        dto.fieldCode,
                        dto.itemCode,
                        'item has no bitrixId in PortalDB — not synced with Bitrix yet',
                    ),
                    db: { ok: false, error: 'item has no bitrixId in PortalDB' },
                });
                continue;
            }
            const manage = new BxTypedEntityFieldManageService(
                domain,
                this.pbxService,
                ctx.bxCtx,
            );
            const bx = await manage.editFieldItem(
                dbField.bitrixId,
                dbItem.bitrixId,
                dto.newValue,
                { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
            );
            const db = await this.safeUpdateDbItem(dbItem.id, dto.newValue);
            out.push({ domain, portalId: ctx.portalId, bx, db });
        }
        return out;
    }

    private async resolveDomains(domain: string): Promise<string[]> {
        if (domain !== MANAGE_DOMAIN_ALL) return [domain];
        const portals = await this.portalService.getPortals();
        if (!portals) return [];
        return portals
            .map(p => p.domain)
            .filter((d): d is string => typeof d === 'string' && d.length > 0);
    }

    private async resolveSafe(
        domain: string,
        type: string,
        group: string,
    ): Promise<ResolvedSmartContext | null> {
        try {
            const ctx = await this.resolver.resolve({ domain, type, group });
            const portal = await this.portalService.getPortalByDomain(domain);
            if (!portal) {
                this.logger.warn(`portal not found for ${domain}`);
                return null;
            }
            return {
                owner: ctx.owner,
                bxCtx: ctx.bxCtx,
                smartBitrixTypeId: ctx.smartBitrixTypeId,
                smartDbId: Number(ctx.smartDbId),
                portalId: Number(portal.id),
            };
        } catch (e) {
            this.logger.warn(
                `smart context not resolved for ${domain}/${type}/${group}: ${(e as Error).message}`,
            );
            return null;
        }
    }

    private async findDbField(
        smartDbId: number,
        code: string,
    ): Promise<PbxFieldEntity | null> {
        const fields = await this.pbxFieldService.findByEntityIdAndCodes(
            PbxEntityTypePrisma.SMART,
            BigInt(smartDbId),
            [code],
        );
        return fields[0] ?? null;
    }

    private async deleteDbFields(
        dbFields: PbxFieldEntity[],
        bxResults: BxTypedFieldDeleteResult[],
    ): Promise<string[]> {
        const okCodes = new Set(
            bxResults.filter(r => r.deleted).map(r => r.code),
        );
        const deletableIds = dbFields
            .filter(f => okCodes.has(f.code) && f.id !== undefined)
            .map(f => BigInt(f.id as string));
        if (deletableIds.length === 0) return [];
        await this.pbxFieldService.deleteFieldsByIds(deletableIds);
        return deletableIds.map(id => id.toString());
    }

    private async safeDeleteDbItem(
        itemId: string | undefined,
    ): Promise<{ ok: boolean; itemId?: string; error?: string }> {
        if (!itemId) return { ok: false, error: 'item has no id in PortalDB' };
        try {
            await this.pbxFieldService.deleteFieldItem(itemId);
            return { ok: true, itemId };
        } catch (e) {
            return {
                ok: false,
                itemId,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    private async safeUpdateDbItem(
        itemId: string | undefined,
        newValue: string,
    ): Promise<{ ok: boolean; itemId?: string; error?: string }> {
        if (!itemId) return { ok: false, error: 'item has no id in PortalDB' };
        try {
            await this.pbxFieldService.updateFieldItemNameById(itemId, newValue);
            return { ok: true, itemId };
        } catch (e) {
            return {
                ok: false,
                itemId,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    private notFoundBxItem(
        fieldCode: string,
        itemCode: string,
        error: string = 'skipped — PortalDB lookup failed',
    ): BxTypedFieldItemOperationResult {
        return {
            fieldCode,
            itemCode,
            bxFieldId: null,
            bxItemId: null,
            ok: false,
            error,
        };
    }
}
