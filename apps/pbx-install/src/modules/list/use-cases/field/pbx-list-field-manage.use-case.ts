import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntity, PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import {
    BxFieldDeleteResult,
    BxFieldItemOperationResult,
    MANAGE_DOMAIN_ALL,
    PerPortalFieldDeleteResult,
    PerPortalFieldItemResult,
} from '@app/pbx-install/shared';
import {
    DeleteListFieldItemDto,
    DeleteListFieldsDto,
    EditListFieldItemDto,
} from '../../dto/manage-list-field.dto';
import {
    ListContext,
    ListContextResolver,
} from '../../services/list-context.resolver';
import { BxListFieldManageService } from '../../services/install/bx-list-field-manage.service';
import { fullListFieldCode } from '../../lib/list-field-code.util';

/**
 * Manage-операции над полями списков Bitrix-портала
 * (зеркало PbxCompanyFieldManageUseCase, адресация списка по type+group).
 *
 * 1) deleteFields — удаляет указанные поля в PortalDB и Bitrix.
 * 2) deleteFieldItem — удаляет один элемент enumeration-поля в обоих хранилищах.
 * 3) editFieldItem — обновляет VALUE/name одного item-а в обоих хранилищах.
 *
 * Bitrix-сторона адресует поле по FIELD_ID (= bitrixCamelId, формат PROPERTY_N).
 * При `domain === 'all'` операция выполняется для всех порталов; порталы без
 * списка пропускаются (resolveSafe), ошибки не роняют остальные порталы.
 */
@Injectable()
export class PbxListFieldManageUseCase {
    private readonly logger = new Logger(PbxListFieldManageUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly resolver: ListContextResolver,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async deleteFields(
        dto: DeleteListFieldsDto,
    ): Promise<PerPortalFieldDeleteResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalFieldDeleteResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolver.resolveSafe({
                domain,
                type: dto.type,
                group: dto.group,
            });
            if (!ctx) {
                continue;
            }
            // В БД code хранится полным (`${group}_${type}_${code}`);
            // короткие коды из dto дополняем полными кандидатами
            const codeCandidates = this.buildCodeCandidates(dto, dto.codes);
            const dbFields = await this.pbxFieldService.findByEntityIdAndCodes(
                PbxEntityTypePrisma.BITRIX_LIST,
                ctx.listDbId,
                codeCandidates,
            );
            const notFoundCodes = dto.codes.filter(
                c =>
                    !dbFields.some(
                        f =>
                            f.code === c ||
                            f.code === fullListFieldCode(dto, c),
                    ),
            );
            const manage = this.createManageService(domain, ctx);
            const bx = await manage.deleteFields(
                dbFields.map(f => ({
                    code: f.code,
                    bxFieldId: f.bitrixCamelId,
                })),
            );
            const deletedDbFieldIds = await this.deleteDbFields(dbFields, bx);
            results.push({
                domain,
                portalId: ctx.portalId,
                bx,
                deletedDbFieldIds,
                notFoundCodes,
            });
        }
        return results;
    }

    async deleteFieldItem(
        dto: DeleteListFieldItemDto,
    ): Promise<PerPortalFieldItemResult[]> {
        return await this.forEachPortalItem(
            dto,
            async (domain, ctx, dbField, dbItem) => {
                const manage = this.createManageService(domain, ctx);
                const bx = await manage.deleteFieldItem(
                    dbField.bitrixCamelId,
                    dbItem.bitrixId,
                    { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
                );
                const db = await this.safeDeleteDbItem(dbItem.id);
                return { bx, db };
            },
        );
    }

    async editFieldItem(
        dto: EditListFieldItemDto,
    ): Promise<PerPortalFieldItemResult[]> {
        return await this.forEachPortalItem(
            dto,
            async (domain, ctx, dbField, dbItem) => {
                const manage = this.createManageService(domain, ctx);
                const bx = await manage.editFieldItem(
                    dbField.bitrixCamelId,
                    dbItem.bitrixId,
                    dto.newValue,
                    { fieldCode: dto.fieldCode, itemCode: dto.itemCode },
                );
                const db = await this.safeUpdateDbItem(dbItem.id, dto.newValue);
                return { bx, db };
            },
        );
    }

    /** Общий каркас item-операций: резолв портала/списка/поля/элемента с ранними выходами. */
    private async forEachPortalItem(
        dto: DeleteListFieldItemDto | EditListFieldItemDto,
        operation: (
            domain: string,
            ctx: ListContext,
            dbField: PbxFieldEntity,
            dbItem: PbxFieldEntity['items'][number] & { bitrixId: number },
        ) => Promise<{
            bx: BxFieldItemOperationResult;
            db: { ok: boolean; itemId?: string; error?: string };
        }>,
    ): Promise<PerPortalFieldItemResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalFieldItemResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolver.resolveSafe({
                domain,
                type: dto.type,
                group: dto.group,
            });
            if (!ctx) {
                continue;
            }
            const dbField = await this.findDbField(ctx, dto, dto.fieldCode);
            if (!dbField) {
                results.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItemResult(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'field not found in PortalDB' },
                });
                continue;
            }
            const dbItem = dbField.items.find(i => i.code === dto.itemCode);
            if (!dbItem) {
                results.push({
                    domain,
                    portalId: ctx.portalId,
                    bx: this.notFoundBxItemResult(dto.fieldCode, dto.itemCode),
                    db: { ok: false, error: 'list item not found in PortalDB' },
                });
                continue;
            }
            if (!dbItem.bitrixId) {
                results.push({
                    domain,
                    portalId: ctx.portalId,
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
            const { bx, db } = await operation(
                domain,
                ctx,
                dbField,
                dbItem as PbxFieldEntity['items'][number] & {
                    bitrixId: number;
                },
            );
            results.push({ domain, portalId: ctx.portalId, bx, db });
        }
        return results;
    }

    private createManageService(
        domain: string,
        ctx: ListContext,
    ): BxListFieldManageService {
        return new BxListFieldManageService(domain, this.pbxService, {
            IBLOCK_ID: ctx.listBitrixId,
        });
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
        ctx: ListContext,
        list: { type: string; group: string },
        code: string,
    ): Promise<PbxFieldEntity | null> {
        const fields = await this.pbxFieldService.findByEntityIdAndCodes(
            PbxEntityTypePrisma.BITRIX_LIST,
            ctx.listDbId,
            this.buildCodeCandidates(list, [code]),
        );
        return fields[0] ?? null;
    }

    /** Короткие коды из dto + их полные легаси-варианты `${group}_${type}_${code}`. */
    private buildCodeCandidates(
        list: { type: string; group: string },
        codes: string[],
    ): string[] {
        const candidates = new Set<string>();
        for (const code of codes) {
            candidates.add(code);
            candidates.add(fullListFieldCode(list, code));
        }
        return [...candidates];
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
