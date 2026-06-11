import { IBXField } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    PbxFieldEntityDto,
    PortalContactService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface PbxContactMergedField {
    name: string;
    p: PbxFieldEntityDto | null;
    bx: IBXField | null;
}

/** Данные по именам полей (bitrixId в портале = name в шаблоне) для склейки с parse. */
export interface PbxContactDataByFieldNamesResult {
    mergedFields: PbxContactMergedField[];
    filteredPortalFields: PbxFieldEntityDto[];
    bitrixFields: IBXField[];
}
export interface PbxContactMonitoringResult {
    mergedFields: PbxContactMergedField[];
    portalFieldsWithoutMerged: PbxFieldEntityDto[];
    bitrixFieldsWithoutMerged: IBXField[];
}
@Injectable()
export class PbxContactMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalContactService: PortalContactService,
        private readonly portalService: PortalStoreService,
    ) {}
    async getPbxContactDataByAllPortalFields(
        domain: string,
    ): Promise<PbxContactMonitoringResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        const portalContact =
            await this.portalContactService.findWithFieldsByPortalId(portalId);
        const bitrixContactFields = await bitrix.contact.getFieldsList();

        const mergedFieldsData = [] as PbxContactMergedField[];
        for (const bxField of bitrixContactFields.result) {
            const portalField = portalContact?.fields.find(
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
        const portalFieldsWithoutMerged = portalContact?.fields.filter(
            f => !mergedFieldsData.some(m => m.p?.code === f.code),
        );
        const bitrixFieldsWithoutMerged = bitrixContactFields.result.filter(
            f => !mergedFieldsData.some(m => m.bx?.FIELD_NAME === f.FIELD_NAME),
        );
        return {
            mergedFields: mergedFieldsData,
            portalFieldsWithoutMerged: portalFieldsWithoutMerged ?? [],
            bitrixFieldsWithoutMerged,
        };
    }

    async getPbxContactDataByFieldNames(
        domain: string,
        fieldNames: string[],
    ): Promise<PbxContactMergedField[]> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        const portalContact =
            await this.portalContactService.findWithFieldsByPortalId(portalId);

        const filtredContactFields =
            portalContact?.fields?.filter(f =>
                fieldNames.includes(f.bitrixId),
            ) ?? [];

        if (!portalContact?.fields) {
            throw new NotFoundException('Contact fields not found');
        }
        const bitrixFields = [] as IBXField[];
        for (const name of fieldNames) {
            const bitrixContactField = await bitrix.contact.getFieldsList({
                [`FIELD_NAME`]: `UF_CRM_${name}`,
            });

            if (bitrixContactField.result[0]) {
                bitrixFields.push(bitrixContactField.result[0]);
            }
        }

        const result = [] as PbxContactMergedField[];
        for (const name of fieldNames) {
            const resultFieldData: PbxContactMergedField = {
                name: name,
                p: null,
                bx: null,
            };
            const p =
                filtredContactFields.find(f => f.bitrixId === name) ?? null;
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
