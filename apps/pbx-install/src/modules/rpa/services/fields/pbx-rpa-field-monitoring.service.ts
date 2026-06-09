import { Injectable, NotFoundException } from '@nestjs/common';
import { IUserFieldConfig } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntity, PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalRpaService } from '@lib/portal-lib/pbx-domain/portal-rpa';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { RpaNameEnum } from '../../dto/install-rpa.dto';

/** Одно смерженное поле RPA: портал ↔ Bitrix. */
export interface PbxRpaMergedField {
    name: string;
    p: PbxFieldEntity | null;
    bx: IUserFieldConfig | null;
}

export interface PbxRpaFieldMonitoringResult {
    mergedFields: PbxRpaMergedField[];
    portalFieldsWithoutMerged: PbxFieldEntity[];
    bitrixFieldsWithoutMerged: IUserFieldConfig[];
}

/**
 * Сводка полей одного RPA: PortalDB (`t_fields`, entity = `BTX_RPA`) против Bitrix
 * (`userfieldconfig.list({ moduleId: 'rpa', filter: { entityId: RPA_<typeId> } })`).
 */
@Injectable()
export class PbxRpaFieldMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalRpaService: PortalRpaService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    async getPbxRpaFieldsByDomain(
        domain: string,
        rpaName: RpaNameEnum,
    ): Promise<PbxRpaFieldMonitoringResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const rpa = await this.portalRpaService.findFirstByPortalAndCode(
            BigInt(portal.id),
            rpaName,
        );
        if (!rpa || !rpa.typeId) {
            throw new NotFoundException(`RPA not installed for ${rpaName}`);
        }
        const bitrixEntityId = `RPA_${Number(rpa.typeId)}`;

        const portalFields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.BTX_RPA,
            rpa.id,
        );
        const listResponse = await bitrix.userFieldConfig.list({
            moduleId: 'rpa',
            filter: { entityId: bitrixEntityId },
        });
        const bitrixFields =
            (listResponse.result as { fields?: IUserFieldConfig[] } | undefined)
                ?.fields ?? [];

        const merged: PbxRpaMergedField[] = [];
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
                if (portalField.id) {
                    matchedPortalIds.add(String(portalField.id));
                }
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

    /** Точечный merge по полному `fieldName`-у в Bitrix (для search-сервиса). */
    async getPbxRpaDataByFieldNames(
        domain: string,
        rpaName: RpaNameEnum,
        fieldNames: string[],
    ): Promise<PbxRpaMergedField[]> {
        if (fieldNames.length === 0) return [];
        const full = await this.getPbxRpaFieldsByDomain(domain, rpaName);
        const out: PbxRpaMergedField[] = [];
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
        return out;
    }
}
