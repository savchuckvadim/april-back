import { IBXField } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    PbxFieldEntityDto,
    PortalLeadService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface PbxLeadMergedField {
    name: string;
    p: PbxFieldEntityDto | null;
    bx: IBXField | null;
}

/** Данные по именам полей (bitrixId в портале = name в шаблоне) для склейки с parse. */
export interface PbxLeadDataByFieldNamesResult {
    mergedFields: PbxLeadMergedField[];
    filteredPortalFields: PbxFieldEntityDto[];
    bitrixFields: IBXField[];
}
export interface PbxLeadMonitoringResult {
    mergedFields: PbxLeadMergedField[];
    portalFieldsWithoutMerged: PbxFieldEntityDto[];
    bitrixFieldsWithoutMerged: IBXField[];
}
@Injectable()
export class PbxLeadMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalLeadService: PortalLeadService,
        private readonly portalService: PortalStoreService,
    ) {}
    async getPbxLeadDataByAllPortalFields(
        domain: string,
    ): Promise<PbxLeadMonitoringResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        const portalLead =
            await this.portalLeadService.findWithFieldsByPortalId(portalId);
        const bitrixLeadFields = await bitrix.lead.getFieldsList();

        const mergedFieldsData = [] as PbxLeadMergedField[];
        for (const bxField of bitrixLeadFields.result) {
            const portalField = portalLead?.fields.find(
                f => `UF_CRM_${f.bitrixId}` === bxField.FIELD_NAME,
            );
            if (portalField) {
                mergedFieldsData.push({
                    name: bxField.FIELD_NAME,
                    p: portalField,
                    bx: bxField,
                });
            }
        }
        const portalFieldsWithoutMerged = portalLead?.fields.filter(
            f => !mergedFieldsData.some(m => m.p?.code === f.code),
        );
        const bitrixFieldsWithoutMerged = bitrixLeadFields.result.filter(
            f => !mergedFieldsData.some(m => m.bx?.FIELD_NAME === f.FIELD_NAME),
        );
        return {
            mergedFields: mergedFieldsData,
            portalFieldsWithoutMerged: portalFieldsWithoutMerged ?? [],
            bitrixFieldsWithoutMerged,
        };
    }

    async getPbxLeadDataByFieldNames(
        domain: string,
        fieldNames: string[],
    ): Promise<PbxLeadMergedField[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        const portalLead =
            await this.portalLeadService.findWithFieldsByPortalId(portalId);

        const filtredLeadFields =
            portalLead?.fields?.filter(f => fieldNames.includes(f.bitrixId)) ??
            [];

        if (!portalLead?.fields) {
            throw new NotFoundException('Lead fields not found');
        }
        const bitrixFields = [] as IBXField[];
        for (const name of fieldNames) {
            const bitrixLeadField = await bitrix.lead.getFieldsList({
                [`FIELD_NAME`]: `UF_CRM_${name}`,
            });

            if (bitrixLeadField.result[0]) {
                bitrixFields.push(bitrixLeadField.result[0]);
            }
        }

        const result = [] as PbxLeadMergedField[];
        for (const name of fieldNames) {
            const resultFieldData: PbxLeadMergedField = {
                name: name,
                p: null,
                bx: null,
            };
            const p = filtredLeadFields.find(f => f.bitrixId === name) ?? null;
            const bx =
                bitrixFields.find(f => f.FIELD_NAME === `UF_CRM_${name}`) ??
                null;
            resultFieldData.p = p;
            resultFieldData.bx = bx;
            result.push(resultFieldData);
        }
        console.log('result', result);
        return result;
    }
}
