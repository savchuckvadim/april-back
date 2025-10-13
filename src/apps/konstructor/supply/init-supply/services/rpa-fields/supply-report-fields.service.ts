import { Injectable } from '@nestjs/common';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { IBxRpaItem } from '@/modules/bitrix';
import { PbxFieldItemDto } from '@/apps/konstructor/document-generate/dto/entity-form-field/entity-form-field.dto';
import {
    SupplyReportCodeEnum,
    SupplyReportDto,
} from '../../dto/supply-fields/supply-fields.dto';
import { SmartFieldDto } from '@/apps/konstructor/document-generate/dto/form-field/form-field.dto';
import { InitSupplyFileService } from '../file/init-supply-file.service';

@Injectable()
export class InitSupplyRpaSupplyReportFieldsService {
    constructor(private readonly fileService: InitSupplyFileService) {}
    public async get(dto: InitSupplyDto, PortalModel: PortalModel) {
        const supplyReportRpaValues = await this.processSupplyReportFields(
            dto.supplyReport,
            PortalModel,
        );

        const rpaFields = {
            ...supplyReportRpaValues,
        } as Partial<IBxRpaItem>;

        return rpaFields;
    }

    private async processSupplyReportFields(
        supplyReport: SupplyReportDto[],
        PortalModel: PortalModel,
    ): Promise<Record<string, string | number | [string, string]> | undefined> {
        const result = {} as Record<string, string | number | [string, string]>;

        for (const supplyReportRqItem of supplyReport) {
            const rpaField = PortalModel.getRpaFieldByCode(
                'supply',
                supplyReportRqItem.code,
            );
            const rpaFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode(
                'supply',
                supplyReportRqItem.code,
            );
            if (!rpaFieldBitrixId) {
                console.log('Rpa field not found', supplyReportRqItem.code);
                continue;
            }
            if (supplyReportRqItem.type === 'file') {
                if ((supplyReportRqItem?.value as SmartFieldDto)?.urlMachine) {
                    const value =
                        await this.fileService.downloadBitrixFileAndConvertToBase64(
                            (supplyReportRqItem?.value as SmartFieldDto)
                                ?.urlMachine,
                            supplyReportRqItem.name,
                        );
                    result[rpaFieldBitrixId] = value;
                } else if (supplyReportRqItem.value === null) {
                    result[rpaFieldBitrixId] = '';
                }
            } else if (supplyReportRqItem.type === 'select') {
                if (
                    typeof supplyReportRqItem.value === 'object' &&
                    supplyReportRqItem.value !== null
                ) {
                    const itemValue =
                        supplyReportRqItem.value as PbxFieldItemDto;
                    console.log('itemValue', itemValue);
                    let itemCode = itemValue.code;
                    if (
                        supplyReportRqItem.code ===
                        SupplyReportCodeEnum.invoice_result
                    ) {
                        if (itemCode === 'in_progress') {
                            itemCode = 'in_work';
                        }
                    }
                    const value = rpaField
                        ? PortalModel.getFieldItemByCode(rpaField, itemCode)
                        : null;
                    result[rpaFieldBitrixId] = value ? value.bitrixId : '';
                } else if (supplyReportRqItem.value === null) {
                    result[rpaFieldBitrixId] = '';
                }
            } else {
                if (
                    typeof supplyReportRqItem.value === 'string' ||
                    supplyReportRqItem.value === null
                ) {
                    result[rpaFieldBitrixId] = supplyReportRqItem.value || '';
                }
            }
        }
        return result;
    }
}
