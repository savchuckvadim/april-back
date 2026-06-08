import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    PbxFieldEntity,
    PbxFieldService,
    PortalDealService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import {
    BxEntityFieldManageService,
    BxFieldDeleteResult,
    BxFieldItemOperationResult,
    DeleteEntityFieldItemDto,
    DeleteEntityFieldsDto,
    EditEntityFieldItemDto,
    MANAGE_DOMAIN_ALL,
} from '../../../shared';

interface PerPortalDeleteResult {
    domain: string;
    portalId: number;
    bx: BxFieldDeleteResult[];
    deletedDbFieldIds: string[];
    notFoundCodes: string[];
}

interface PerPortalItemResult {
    domain: string;
    portalId: number;
    bx: BxFieldItemOperationResult;
    db: { ok: boolean; itemId?: string; error?: string };
}

/**
 * Manage-операции над полями сделки Bitrix-портала.
 *
 * 1) deleteFields  — удаляет указанные поля Deal в PortalDB и Bitrix (для enumeration list-items в Bitrix
 *    удаляются автоматически вместе с полем; в PortalDB items удаляются в транзакции вместе с filed).
 * 2) deleteFieldItem — удаляет один элемент enumeration-поля Deal в обоих хранилищах.
 * 3) editFieldItem  — обновляет VALUE/name одного item-а в обоих хранилищах.
 *
 * При `domain === 'all'` операция выполняется для всех порталов (Deal должен существовать в PortalDB).
 */
@Injectable()
export class PbxDealFieldManageUseCase {
    private readonly logger = new Logger(PbxDealFieldManageUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalDealService: PortalDealService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async deleteFields(
        dto: DeleteEntityFieldsDto,
    ): Promise<PerPortalDeleteResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalDeleteResult[] = [];
        for (const domain of domains) {
            const portal = await this.portalService.getPortalByDomain(domain);
            if (!portal) {
                this.logger.warn(`portal not found for domain ${domain}`);
                continue;
            }
            const portalId = Number(portal.id);
            const deal = await this.portalDealService.findByPortalId(portalId);
            if (!deal) {
                this.logger.warn(`deal not found for portalId ${portalId}`);
                continue;
            }
            const dbFields = await this.pbxFieldService.findByEntityIdAndCodes(
                PbxEntityTypePrisma.DEAL,
                BigInt(deal.id),
                dto.codes,
            );
            const notFoundCodes = dto.codes.filter(
                c => !dbFields.some(f => f.code === c),
            );
            const bxFieldNames = dbFields.map(f => ({
                code: f.code,
                bxFieldName: f.bitrixId,
            }));
            const manage = new BxEntityFieldManageService(
                domain,
                this.pbxService,
                'deal',
            );
            const bx = await manage.deleteFields(bxFieldNames);
            const deletedDbFieldIds = await this.deleteDbFields(dbFields, bx);
            results.push({
                domain,
                portalId,
                bx,
                deletedDbFieldIds,
                notFoundCodes,
            });
        }
        return results;
    }

    async deleteFieldItem(
        dto: DeleteEntityFieldItemDto,
    ): Promise<PerPortalItemResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalItemResult[] = [];
        for (const domain of domains) {
            const portal = await this.portalService.getPortalByDomain(domain);
            if (!portal) {
                this.logger.warn(`portal not found for domain ${domain}`);
                continue;
            }
            const portalId = Number(portal.id);
            const deal = await this.portalDealService.findByPortalId(portalId);
            if (!deal) {
                this.logger.warn(`deal not found for portalId ${portalId}`);
                continue;
            }
            const dbField = await this.findDbField(deal.id, dto.fieldCode);
            if (!dbField) {
                results.push({
                    domain,
                    portalId,
                    bx: this.notFoundBxItemResult(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'field not found in PortalDB' },
                });
                continue;
            }
            const dbItem = dbField.items.find(i => i.code === dto.itemCode);
            if (!dbItem) {
                results.push({
                    domain,
                    portalId,
                    bx: this.notFoundBxItemResult(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'list item not found in PortalDB' },
                });
                continue;
            }
            if (!dbItem.bitrixId) {
                results.push({
                    domain,
                    portalId,
                    bx: this.notFoundBxItemResult(
                        dto.fieldCode,
                        dto.itemCode,
                        'item has no bitrixId in PortalDB — not synced with Bitrix yet',
                    ),
                    db: {
                        ok: false,
                        error: 'item has no bitrixId in PortalDB',
                    },
                });
                continue;
            }
            const manage = new BxEntityFieldManageService(
                domain,
                this.pbxService,
                'deal',
            );
            const bx = await manage.deleteFieldItem(
                dbField.bitrixId,
                dbItem.bitrixId,
                { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
            );
            const db = await this.safeDeleteDbItem(dbItem.id);
            results.push({ domain, portalId, bx, db });
        }
        return results;
    }

    async editFieldItem(
        dto: EditEntityFieldItemDto,
    ): Promise<PerPortalItemResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalItemResult[] = [];
        for (const domain of domains) {
            const portal = await this.portalService.getPortalByDomain(domain);
            if (!portal) {
                this.logger.warn(`portal not found for domain ${domain}`);
                continue;
            }
            const portalId = Number(portal.id);
            const deal = await this.portalDealService.findByPortalId(portalId);
            if (!deal) {
                this.logger.warn(`deal not found for portalId ${portalId}`);
                continue;
            }
            const dbField = await this.findDbField(deal.id, dto.fieldCode);
            if (!dbField) {
                results.push({
                    domain,
                    portalId,
                    bx: this.notFoundBxItemResult(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'field not found in PortalDB' },
                });
                continue;
            }
            const dbItem = dbField.items.find(i => i.code === dto.itemCode);
            if (!dbItem) {
                results.push({
                    domain,
                    portalId,
                    bx: this.notFoundBxItemResult(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'list item not found in PortalDB' },
                });
                continue;
            }
            if (!dbItem.bitrixId) {
                results.push({
                    domain,
                    portalId,
                    bx: this.notFoundBxItemResult(
                        dto.fieldCode,
                        dto.itemCode,
                        'item has no bitrixId in PortalDB — not synced with Bitrix yet',
                    ),
                    db: {
                        ok: false,
                        error: 'item has no bitrixId in PortalDB',
                    },
                });
                continue;
            }
            const manage = new BxEntityFieldManageService(
                domain,
                this.pbxService,
                'deal',
            );
            const bx = await manage.editFieldItem(
                dbField.bitrixId,
                dbItem.bitrixId,
                dto.newValue,
                { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
            );
            const db = await this.safeUpdateDbItem(dbItem.id, dto.newValue);
            results.push({ domain, portalId, bx, db });
        }
        return results;
    }

    private async resolveDomains(domain: string): Promise<string[]> {
        if (domain !== MANAGE_DOMAIN_ALL) {
            return [domain];
        }
        const portals = await this.portalService.getPortals();
        if (!portals) return [];
        return portals
            .map(p => p.domain)
            .filter((d): d is string => typeof d === 'string' && d.length > 0);
    }

    private async findDbField(
        dealId: number,
        code: string,
    ): Promise<PbxFieldEntity | null> {
        const fields = await this.pbxFieldService.findByEntityIdAndCodes(
            PbxEntityTypePrisma.DEAL,
            BigInt(dealId),
            [code],
        );
        return fields[0] ?? null;
    }

    private async deleteDbFields(
        dbFields: PbxFieldEntity[],
        bxResults: BxFieldDeleteResult[],
    ): Promise<string[]> {
        const okCodes = new Set(
            bxResults.filter(r => r.deleted).map(r => r.code),
        );
        const deletableIds = dbFields
            .filter(f => okCodes.has(f.code) && f.id !== undefined)
            .map(f => BigInt(f.id as string));
        if (deletableIds.length === 0) {
            return [];
        }
        await this.pbxFieldService.deleteFieldsByIds(deletableIds);
        return deletableIds.map(id => id.toString());
    }

    private async safeDeleteDbItem(
        itemId: string | undefined,
    ): Promise<{ ok: boolean; itemId?: string; error?: string }> {
        if (!itemId) {
            return { ok: false, error: 'item has no id in PortalDB' };
        }
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
        if (!itemId) {
            return { ok: false, error: 'item has no id in PortalDB' };
        }
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

    private notFoundBxItemResult(
        fieldCode: string,
        itemCode: string,
        error: string = 'skipped — PortalDB lookup failed',
    ): BxFieldItemOperationResult {
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
