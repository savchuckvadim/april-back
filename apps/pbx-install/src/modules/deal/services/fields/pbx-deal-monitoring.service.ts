import { IBXField } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntityDto, PortalDealService } from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface PbxDealMergedField {
    name: string;
    p: PbxFieldEntityDto | null;
    bx: IBXField | null;
}

/** Данные по именам полей (bitrixId в портале = name в шаблоне) для склейки с parse. */
export interface PbxDealDataByFieldNamesResult {
    mergedFields: PbxDealMergedField[];
    filteredPortalFields: PbxFieldEntityDto[];
    bitrixFields: IBXField[];
}
export interface PbxDealMonitoringResult {
    mergedFields: PbxDealMergedField[];
    portalFieldsWithoutMerged: PbxFieldEntityDto[];
    bitrixFieldsWithoutMerged: IBXField[];
}
@Injectable()
export class PbxDealMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalDealService: PortalDealService,
        private readonly portalService: PortalStoreService,
    ) {}
    async getPbxDealDataByAllPortalFields(
        domain: string,
    ): Promise<PbxDealMonitoringResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        const portalDeal =
            await this.portalDealService.findWithFieldsByPortalId(portalId);
        const bitrixDealFields = await bitrix.deal.getFieldsList();

        const mergedFieldsData = [] as PbxDealMergedField[];
        for (const bxField of bitrixDealFields.result) {
            const portalField = portalDeal?.fields.find(
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
        const portalFieldsWithoutMerged = portalDeal?.fields.filter(
            f => !mergedFieldsData.some(m => m.p?.code === f.code),
        );
        const bitrixFieldsWithoutMerged = bitrixDealFields.result.filter(
            f => !mergedFieldsData.some(m => m.bx?.FIELD_NAME === f.FIELD_NAME),
        );
        return {
            mergedFields: mergedFieldsData,
            portalFieldsWithoutMerged: portalFieldsWithoutMerged ?? [],
            bitrixFieldsWithoutMerged,
        };
    }

    async getPbxDealDataByFieldNames(
        domain: string,
        fieldNames: string[],
    ): Promise<PbxDealMergedField[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        const portalDeal =
            await this.portalDealService.findWithFieldsByPortalId(portalId);

        const filtredDealFields =
            portalDeal?.fields?.filter(f => fieldNames.includes(f.bitrixId)) ??
            [];

        if (!portalDeal?.fields) {
            throw new NotFoundException('Deal fields not found');
        }
        const bitrixFields = [] as IBXField[];
        for (const name of fieldNames) {
            const bitrixDealField = await bitrix.deal.getFieldsList({
                [`FIELD_NAME`]: `UF_CRM_${name}`,
            });

            if (bitrixDealField.result[0]) {
                bitrixFields.push(bitrixDealField.result[0]);
            }
        }

        const result = [] as PbxDealMergedField[];
        for (const name of fieldNames) {
            const resultFieldData: PbxDealMergedField = {
                name: name,
                p: null,
                bx: null,
            };
            const p = filtredDealFields.find(f => f.bitrixId === name) ?? null;
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
