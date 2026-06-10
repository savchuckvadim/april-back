import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntity, PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import {
    BxFieldDeleteResult,
    BxFieldItemOperationResult,
    BxUserFieldManageService,
    DeleteEntityFieldItemDto,
    DeleteEntityFieldsDto,
    EditEntityFieldItemDto,
    MANAGE_DOMAIN_ALL,
} from '../../shared';
import { PbxUserEntityService } from '../services/pbx-user-entity.service';

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
 * Manage-операции над полями пользователя Bitrix-портала (PortalDB + Bitrix).
 *
 * 1) deleteFields — удаляет указанные поля в PortalDB и Bitrix.
 * 2) deleteFieldItem — удаляет один элемент enumeration-поля в обоих хранилищах.
 * 3) editFieldItem — обновляет VALUE/name одного item-а в обоих хранилищах.
 *
 * При `domain === 'all'` операция выполняется для всех порталов (user должен
 * существовать в PortalDB).
 */
@Injectable()
export class PbxUserFieldManageUseCase {
    private readonly logger = new Logger(PbxUserFieldManageUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly userEntityService: PbxUserEntityService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async deleteFields(
        dto: DeleteEntityFieldsDto,
    ): Promise<PerPortalDeleteResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalDeleteResult[] = [];
        for (const domain of domains) {
            const resolved = await this.userEntityService.findUserId(domain);
            if (!resolved) {
                this.logger.warn(`user not found for domain ${domain}`);
                continue;
            }
            const { portalId, userId } = resolved;
            const dbFields = await this.pbxFieldService.findByEntityIdAndCodes(
                PbxEntityTypePrisma.USER,
                BigInt(userId),
                dto.codes,
            );
            const notFoundCodes = dto.codes.filter(
                c => !dbFields.some(f => f.code === c),
            );
            const bxFieldNames = dbFields.map(f => ({
                code: f.code,
                bxFieldName: f.bitrixId,
            }));
            const manage = new BxUserFieldManageService(
                domain,
                this.pbxService,
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
            const ctx = await this.resolveItemContext(
                domain,
                dto.fieldCode,
                dto.itemCode,
            );
            if (!ctx.ok) {
                if (ctx.result) results.push(ctx.result);
                continue;
            }
            const manage = new BxUserFieldManageService(
                domain,
                this.pbxService,
            );
            const bx = await manage.deleteFieldItem(
                ctx.dbField.bitrixId,
                ctx.dbItem.bitrixId,
                { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
            );
            const db = bx.ok
                ? await this.safeDeleteDbItem(ctx.dbItem.id)
                : { ok: false, error: 'bitrix op failed — db skipped' };
            results.push({ domain, portalId: ctx.portalId, bx, db });
        }
        return results;
    }

    async editFieldItem(
        dto: EditEntityFieldItemDto,
    ): Promise<PerPortalItemResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalItemResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolveItemContext(
                domain,
                dto.fieldCode,
                dto.itemCode,
            );
            if (!ctx.ok) {
                if (ctx.result) results.push(ctx.result);
                continue;
            }
            const manage = new BxUserFieldManageService(
                domain,
                this.pbxService,
            );
            const bx = await manage.editFieldItem(
                ctx.dbField.bitrixId,
                ctx.dbItem.bitrixId,
                dto.newValue,
                { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
            );
            const db = bx.ok
                ? await this.safeUpdateDbItem(ctx.dbItem.id, dto.newValue)
                : { ok: false, error: 'bitrix op failed — db skipped' };
            results.push({ domain, portalId: ctx.portalId, bx, db });
        }
        return results;
    }

    /**
     * Находит портал/user/поле/item в PortalDB для item-операции.
     * Возвращает либо готовый контекст (ok:true), либо результат-ошибку (ok:false).
     */
    private async resolveItemContext(
        domain: string,
        fieldCode: string,
        itemCode: string,
    ): Promise<
        | {
              ok: true;
              portalId: number;
              dbField: PbxFieldEntity;
              dbItem: { id?: string; bitrixId: number };
          }
        | { ok: false; result?: PerPortalItemResult }
    > {
        const resolved = await this.userEntityService.findUserId(domain);
        if (!resolved) {
            this.logger.warn(`user not found for domain ${domain}`);
            return { ok: false };
        }
        const { portalId, userId } = resolved;
        const dbField = await this.findDbField(userId, fieldCode);
        if (!dbField) {
            return {
                ok: false,
                result: {
                    domain,
                    portalId,
                    bx: this.notFoundBxItemResult(fieldCode, itemCode),
                    db: { ok: false, error: 'field not found in PortalDB' },
                },
            };
        }
        const dbItem = dbField.items.find(i => i.code === itemCode);
        if (!dbItem || !dbItem.bitrixId) {
            return {
                ok: false,
                result: {
                    domain,
                    portalId,
                    bx: this.notFoundBxItemResult(
                        fieldCode,
                        itemCode,
                        'list item not found / not synced in PortalDB',
                    ),
                    db: {
                        ok: false,
                        error: 'list item not found / not synced in PortalDB',
                    },
                },
            };
        }
        return {
            ok: true,
            portalId,
            dbField,
            dbItem: { id: dbItem.id, bitrixId: dbItem.bitrixId },
        };
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
        userId: number,
        code: string,
    ): Promise<PbxFieldEntity | null> {
        const fields = await this.pbxFieldService.findByEntityIdAndCodes(
            PbxEntityTypePrisma.USER,
            BigInt(userId),
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
