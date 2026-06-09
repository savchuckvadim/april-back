import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntity, PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import {
    BxTypedEntityFieldManageService,
    BxTypedFieldDeleteResult,
    BxTypedFieldItemOperationResult,
    DeleteTypedEntityFieldItemDto,
    DeleteTypedEntityFieldsDto,
    EditTypedEntityFieldItemDto,
    MANAGE_DOMAIN_ALL,
} from '@app/pbx-install/shared';
import {
    RpaContext,
    RpaContextResolver,
} from '../../services/rpa-context.resolver';

interface ResolvedRpaContext {
    bxCtx: RpaContext['bxCtx'];
    rpaDbId: number;
    portalId: number;
}

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
 * Manage-операции над полями конкретного RPA Bitrix-портала.
 *
 * Зеркало `PbxSmartFieldManageUseCase`: адресация по `(domain, rpaName)` (поле `type` DTO = `rpaName`),
 * Bitrix-side — `BxTypedEntityFieldManageService` (`userfieldconfig` с `moduleId: 'rpa'`),
 * в БД портал-`entity_type` — `BTX_RPA`, `entity_id` — `btx_rpas.id`.
 * `domain === 'all'` повторяет операцию по всем порталам с этим RPA.
 */
@Injectable()
export class PbxRpaFieldManageUseCase {
    private readonly logger = new Logger(PbxRpaFieldManageUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly resolver: RpaContextResolver,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async deleteFields(
        dto: DeleteTypedEntityFieldsDto,
    ): Promise<PerPortalDeleteResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const out: PerPortalDeleteResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolveSafe(domain, dto.type);
            if (!ctx) continue;
            const dbFields = await this.pbxFieldService.findByEntityIdAndCodes(
                PbxEntityTypePrisma.BTX_RPA,
                BigInt(ctx.rpaDbId),
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
            const ctx = await this.resolveSafe(domain, dto.type);
            if (!ctx) continue;
            const lookup = await this.lookupItem(
                ctx.rpaDbId,
                dto.fieldCode,
                dto.itemCode,
            );
            if (!lookup.ok) {
                out.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItem(
                        dto.fieldCode,
                        dto.itemCode,
                        lookup.error,
                    ),
                    db: { ok: false, error: lookup.error },
                });
                continue;
            }
            const manage = new BxTypedEntityFieldManageService(
                domain,
                this.pbxService,
                ctx.bxCtx,
            );
            const bx = await manage.deleteFieldItem(
                lookup.field.bitrixId,
                lookup.item.bitrixId,
                { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
            );
            const db = await this.safeDeleteDbItem(lookup.item.id);
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
            const ctx = await this.resolveSafe(domain, dto.type);
            if (!ctx) continue;
            const lookup = await this.lookupItem(
                ctx.rpaDbId,
                dto.fieldCode,
                dto.itemCode,
            );
            if (!lookup.ok) {
                out.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItem(
                        dto.fieldCode,
                        dto.itemCode,
                        lookup.error,
                    ),
                    db: { ok: false, error: lookup.error },
                });
                continue;
            }
            const manage = new BxTypedEntityFieldManageService(
                domain,
                this.pbxService,
                ctx.bxCtx,
            );
            const bx = await manage.editFieldItem(
                lookup.field.bitrixId,
                lookup.item.bitrixId,
                dto.newValue,
                { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
            );
            const db = await this.safeUpdateDbItem(
                lookup.item.id,
                dto.newValue,
            );
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
        rpaName: string,
    ): Promise<ResolvedRpaContext | null> {
        try {
            const ctx = await this.resolver.resolve({ domain, rpaName });
            const portal = await this.portalService.getPortalByDomain(domain);
            if (!portal) {
                this.logger.warn(`portal not found for ${domain}`);
                return null;
            }
            return {
                bxCtx: ctx.bxCtx,
                rpaDbId: ctx.owner.entityDbId,
                portalId: Number(portal.id),
            };
        } catch (e) {
            this.logger.warn(
                `rpa context not resolved for ${domain}/${rpaName}: ${(e as Error).message}`,
            );
            return null;
        }
    }

    private async lookupItem(
        rpaDbId: number,
        fieldCode: string,
        itemCode: string,
    ): Promise<
        | {
              ok: true;
              field: PbxFieldEntity;
              item: PbxFieldEntity['items'][number];
          }
        | { ok: false; error: string }
    > {
        const fields = await this.pbxFieldService.findByEntityIdAndCodes(
            PbxEntityTypePrisma.BTX_RPA,
            BigInt(rpaDbId),
            [fieldCode],
        );
        const field = fields[0];
        if (!field) return { ok: false, error: 'field not found in PortalDB' };
        const item = field.items.find(i => i.code === itemCode);
        if (!item) {
            return { ok: false, error: 'list item not found in PortalDB' };
        }
        if (!item.bitrixId) {
            return {
                ok: false,
                error: 'item has no bitrixId in PortalDB — not synced with Bitrix yet',
            };
        }
        return { ok: true, field, item };
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
            await this.pbxFieldService.updateFieldItemNameById(
                itemId,
                newValue,
            );
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
