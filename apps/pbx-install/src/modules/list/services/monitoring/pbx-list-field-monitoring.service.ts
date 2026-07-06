import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    PbxFieldEntity,
    PbxFieldService,
    PortalListService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { IBXListFieldDescription } from '@/modules/bitrix';
import { ListContextResolver } from '../list-context.resolver';

/** Одно смерженное поле списка: портал ↔ Bitrix. */
export interface PbxListMergedField {
    /** CODE свойства в Bitrix (например, `EVENT_TYPE`) — ключ сопоставления. */
    name: string;
    p: PbxFieldEntity | null;
    bx: IBXListFieldDescription | null;
}

/** Сводка по полям одного списка: смерженные + хвосты с обеих сторон. */
export interface PbxListFieldMonitoringResult {
    mergedFields: PbxListMergedField[];
    portalFieldsWithoutMerged: PbxFieldEntity[];
    bitrixFieldsWithoutMerged: IBXListFieldDescription[];
}

/**
 * Сводка полей одного списка на портале: портал-БД (`bitrixfields`,
 * entity_type=BITRIX_LIST) против Bitrix (`lists.field.get` по IBLOCK_ID).
 *
 * Сопоставление по CODE свойства (= `bitrixId` в PortalDB). Системные поля
 * инфоблока без CODE (NAME, DATE_CREATE…) в сводку не попадают.
 *
 * Аналог PbxSmartFieldMonitoringService, адресация списка `(domain, type, group)`.
 */
@Injectable()
export class PbxListFieldMonitoringService {
    private readonly logger = new Logger(PbxListFieldMonitoringService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalListService: PortalListService,
        private readonly pbxFieldService: PbxFieldService,
        private readonly resolver: ListContextResolver,
    ) {}

    async getPbxListFieldsByDomain(
        domain: string,
        type: string,
        group: string,
    ): Promise<PbxListFieldMonitoringResult> {
        const ctx = await this.resolver.resolve({ domain, type, group });
        const { bitrix } = await this.pbxService.init(domain);

        const portalFields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.BITRIX_LIST,
            ctx.listDbId,
        );
        const response = await bitrix.list.getListFields({
            IBLOCK_ID: ctx.listBitrixId,
        });
        const bitrixFields = Object.values(response.result ?? {}).filter(
            f => Boolean(f.CODE), // системные поля инфоблока без CODE не сравниваем
        );

        const merged: PbxListMergedField[] = [];
        const matchedPortalIds = new Set<string>();
        const matchedBxCodes = new Set<string>();

        for (const bxField of bitrixFields) {
            const bxCode = String(bxField.CODE).toUpperCase();
            const portalField = portalFields.find(
                f => f.bitrixId.toUpperCase() === bxCode,
            );
            if (portalField) {
                merged.push({ name: bxCode, p: portalField, bx: bxField });
                if (portalField.id) {
                    matchedPortalIds.add(String(portalField.id));
                }
                matchedBxCodes.add(bxCode);
            }
        }

        return {
            mergedFields: merged,
            portalFieldsWithoutMerged: portalFields.filter(
                f => !f.id || !matchedPortalIds.has(String(f.id)),
            ),
            bitrixFieldsWithoutMerged: bitrixFields.filter(
                b => !matchedBxCodes.has(String(b.CODE).toUpperCase()),
            ),
        };
    }

    /** Точечный merge для конкретных CODE свойств — используется в search. */
    async getPbxListDataByFieldCodes(
        domain: string,
        type: string,
        group: string,
        fieldCodes: string[],
    ): Promise<PbxListMergedField[]> {
        if (fieldCodes.length === 0) return [];
        const codes = new Set(fieldCodes.map(c => c.toUpperCase()));
        const full = await this.getPbxListFieldsByDomain(domain, type, group);
        return full.mergedFields.filter(f => codes.has(f.name));
    }

    /**
     * Обзор по всем порталам: списки из PortalDB с полями; порталы с ошибкой
     * получения данных возвращаются в списке errors (не роняют сводку).
     */
    async getAllPortals() {
        const portals = (await this.portalService.getPortals()) ?? [];
        const results: unknown[] = [];
        const errors: Array<{ domain: string; error: string }> = [];
        for (const portal of portals) {
            const domain = portal.domain;
            if (!domain) {
                continue;
            }
            try {
                results.push(
                    await this.portalListService.getListsByPortalDomain(domain),
                );
            } catch (e) {
                this.logger.warn(`getAllPortals(${domain}): ${String(e)}`);
                errors.push({
                    domain,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
        return { portals: results, errors };
    }
}
