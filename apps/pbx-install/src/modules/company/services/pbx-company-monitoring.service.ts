import { IBXField } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    PbxFieldEntityDto,
    PortalCompanyService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface PbxCompanyMergedField {
    name: string;
    p: PbxFieldEntityDto | null;
    bx: IBXField | null;
}

/** Данные по именам полей (bitrixId в портале = name в шаблоне) для склейки с parse. */
export interface PbxCompanyDataByFieldNamesResult {
    mergedFields: PbxCompanyMergedField[];
    filteredPortalFields: PbxFieldEntityDto[];
    bitrixFields: IBXField[];
}
export interface PbxCompanyMonitoringResult {
    mergedFields: PbxCompanyMergedField[];
    portalFieldsWithoutMerged: PbxFieldEntityDto[];
    bitrixFieldsWithoutMerged: IBXField[];
}
@Injectable()
export class PbxCompanyMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalCompanyService: PortalCompanyService,
        private readonly portalService: PortalStoreService,
    ) {}
    async getPbxCompanyDataByAllPortalFields(
        domain: string,
    ): Promise<PbxCompanyMonitoringResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        console.log('domain', domain);
        console.log('portal', portal);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        const portalCompany =
            await this.portalCompanyService.findWithFieldsByPortalId(portalId);
        const bitrixCompanyFields = await bitrix.company.getFieldsList();

        const mergedFieldsData = [] as PbxCompanyMergedField[];
        for (const bxField of bitrixCompanyFields.result) {
            const portalField = portalCompany?.fields.find(
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
        const portalFieldsWithoutMerged = portalCompany?.fields.filter(
            f => !mergedFieldsData.some(m => m.p?.code === f.code),
        );
        const bitrixFieldsWithoutMerged = bitrixCompanyFields.result.filter(
            f => !mergedFieldsData.some(m => m.bx?.FIELD_NAME === f.FIELD_NAME),
        );
        return {
            mergedFields: mergedFieldsData,
            portalFieldsWithoutMerged: portalFieldsWithoutMerged ?? [],
            bitrixFieldsWithoutMerged,
        };
    }

    async getPbxCompanyDataByFieldNames(
        domain: string,
        fieldNames: string[],
    ): Promise<PbxCompanyMergedField[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        const portalCompany =
            await this.portalCompanyService.findWithFieldsByPortalId(portalId);

        const filtredCompanyFields =
            portalCompany?.fields?.filter(f =>
                fieldNames.includes(f.bitrixId),
            ) ?? [];

        if (!portalCompany?.fields) {
            throw new NotFoundException('Company fields not found');
        }
        const bitrixFields = [] as IBXField[];
        for (const name of fieldNames) {
            const bitrixCompanyField = await bitrix.company.getFieldsList({
                [`FIELD_NAME`]: `UF_CRM_${name}`,
            });

            if (bitrixCompanyField.result[0]) {
                bitrixFields.push(bitrixCompanyField.result[0]);
            }
        }

        const result = [] as PbxCompanyMergedField[];
        for (const name of fieldNames) {
            const resultFieldData: PbxCompanyMergedField = {
                name: name,
                p: null,
                bx: null,
            };
            const p =
                filtredCompanyFields.find(f => f.bitrixId === name) ?? null;
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
