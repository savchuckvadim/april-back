import { Injectable, NotFoundException } from '@nestjs/common';
import { IUserFieldConfig } from '@/modules/bitrix';
import { BitrixService } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntity, PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { PortalSmartService } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { findConstSmartByTypeGroup } from '@lib/portal-lib/pbx/const-smart-registry';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';

/** Одно смерженное поле смарта: портал ↔ Bitrix. */
export interface PbxSmartMergedField {
    /** `fieldName` из Bitrix (например, `UF_CRM_8_OP_STATUS`) — ключ сопоставления. */
    name: string;
    p: PbxFieldEntity | null;
    bx: IUserFieldConfig | null;
}

/** Сводка по полям одного смарта: смерженные + хвосты с обеих сторон. */
export interface PbxSmartFieldMonitoringResult {
    mergedFields: PbxSmartMergedField[];
    portalFieldsWithoutMerged: PbxFieldEntity[];
    bitrixFieldsWithoutMerged: IUserFieldConfig[];
}

/**
 * Сводка полей одного смарта на портале: портал-БД (`t_fields`) против Bitrix
 * (`userfieldconfig` по `entityId: CRM_<smartTypeId>`, читается постранично через
 * `getAll` — иначе Bitrix отдаёт максимум ~50 полей на страницу и часть полей
 * пропадает из сводки).
 *
 * Аналог {@link PbxDealMonitoringService}, только адресует смарт через
 * `(domain, smartName, group)` (на портале может быть много смартов).
 */
@Injectable()
export class PbxSmartFieldMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async getPbxSmartFieldsByDomain(
        domain: string,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
    ): Promise<PbxSmartFieldMonitoringResult> {
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
        // Строки в PortalDB может не быть (смарт ставили в обход зеркал) —
        // это НЕ значит, что смарта нет в Bitrix: резолвим id типа напрямую
        // по code. Обе стороны пустые → честный пустой результат (фронт
        // покажет шаблон со статусом «не установлено»), а не 404.
        const smartBitrixTypeId = smart?.bitrixId
            ? Number(smart.bitrixId)
            : await this.resolveTypeIdFromBitrix(bitrix, smartName, group);

        const portalFields = smart
            ? await this.pbxFieldService.findByEntityId(
                  PbxEntityTypePrisma.SMART,
                  smart.id,
              )
            : [];
        const bitrixFields = smartBitrixTypeId
            ? await bitrix.userFieldConfig.getAllWithItems('crm', {
                  entityId: `CRM_${smartBitrixTypeId}`,
              })
            : [];

        const merged: PbxSmartMergedField[] = [];
        const matchedPortalIds = new Set<string>();
        const matchedBxNames = new Set<string>();

        for (const bxField of bitrixFields) {
            const portalField = portalFields.find(
                f => f.bitrixId === bxField.fieldName,
            );
            if (portalField) {
                merged.push({
                    name: bxField.fieldName,
                    p: portalField,
                    bx: bxField,
                });
                if (portalField.id)
                    matchedPortalIds.add(String(portalField.id));
                matchedBxNames.add(bxField.fieldName);
            }
        }

        const portalFieldsWithoutMerged = portalFields.filter(
            f => !f.id || !matchedPortalIds.has(String(f.id)),
        );
        const bitrixFieldsWithoutMerged = bitrixFields.filter(
            b => !matchedBxNames.has(b.fieldName),
        );

        return {
            mergedFields: merged,
            portalFieldsWithoutMerged,
            bitrixFieldsWithoutMerged,
        };
    }

    /**
     * Fallback-резолв «маленького» id смарт-типа (основа `CRM_{id}` для
     * userfieldconfig) напрямую из Bitrix по code, когда зеркала в PortalDB
     * нет. Код — descriptor.code из реестра const-смартов либо конвенция
     * `${type}_${group}`.
     */
    private async resolveTypeIdFromBitrix(
        bitrix: BitrixService,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
    ): Promise<number | null> {
        const code =
            findConstSmartByTypeGroup(smartName, group)?.code ??
            `${smartName}_${group}`;
        const response = await this.safeListTypes(bitrix, code);
        const type = response.find(item => item.code === code);
        return type?.id ? Number(type.id) : null;
    }

    private async safeListTypes(
        bitrix: BitrixService,
        code: string,
    ): Promise<{ id?: number; code: string }[]> {
        try {
            const response = await bitrix.smartType.list({
                filter: { code },
                start: -1,
            });
            return (
                (
                    response as {
                        result?: { types?: { id?: number; code: string }[] };
                    }
                ).result?.types ?? []
            );
        } catch {
            return [];
        }
    }

    /**
     * Точечный merge: для конкретных `fieldName`-ов (полное имя UF в Bitrix).
     * Используется в search-сервисе.
     */
    async getPbxSmartDataByFieldNames(
        domain: string,
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
        fieldNames: string[],
    ): Promise<PbxSmartMergedField[]> {
        if (fieldNames.length === 0) return [];
        const full = await this.getPbxSmartFieldsByDomain(
            domain,
            smartName,
            group,
        );
        const wanted = new Set(fieldNames);
        const out: PbxSmartMergedField[] = [];
        for (const name of fieldNames) {
            const m = full.mergedFields.find(f => f.name === name);
            if (m) {
                out.push(m);
                continue;
            }
            const p =
                full.portalFieldsWithoutMerged.find(f => f.bitrixId === name) ??
                null;
            const bx =
                full.bitrixFieldsWithoutMerged.find(
                    f => f.fieldName === name,
                ) ?? null;
            if (p || bx) {
                out.push({ name, p, bx });
            }
        }
        // tslint:disable-next-line — заглушаем неиспользуемую переменную (на случай будущих фильтров).
        void wanted;
        return out;
    }
}
