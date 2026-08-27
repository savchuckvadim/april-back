import { Injectable } from '@nestjs/common';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IBxRpaItem } from '@lib/bitrix';
import { PbxFieldItemDto } from '@app/konstructor/document-generate/dto/entity-form-field/entity-form-field.dto';
import {
    SupplyReportCodeEnum,
    SupplyReportDto,
} from '../../dto/supply-fields/supply-fields.dto';
import {
    DealFieldDto,
    SmartFieldDto,
} from '@app/konstructor/document-generate/dto/form-field/form-field.dto';
import { InitSupplyFileService } from '../file/init-supply-file.service';

@Injectable()
export class InitSupplyRpaSupplyReportFieldsService {
    constructor(private readonly fileService: InitSupplyFileService) {}
    public async get(dto: InitSupplyDto, PortalModel: PortalModel) {
        const supplyReportRpaValues = await this.processSupplyReportFields(
            dto,
            PortalModel,
        );

        const rpaFields = {
            ...supplyReportRpaValues,
        } as Partial<IBxRpaItem>;

        return rpaFields;
    }

    private async processSupplyReportFields(
        dto: InitSupplyDto,
        PortalModel: PortalModel,
    ): Promise<Record<string, string | number | [string, string]> | undefined> {
        const result = {} as Record<string, string | number | [string, string]>;

        for (const supplyReportRqItem of dto.supplyReport) {
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
                const fileValue = await this.resolveFileValue(
                    supplyReportRqItem,
                    dto,
                );
                if (fileValue) {
                    result[rpaFieldBitrixId] = fileValue;
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

    /**
     * Источники файла для поля RPA, в порядке приоритета легаси-версии:
     * 1) файл в смарт-процессе (`urlMachine`);
     * 2) файл, уже лежащий в сделке (`downloadUrl`) — в сделку его писать не
     *    надо, он там есть, копируем только в RPA;
     * 3) файл, приложенный менеджером в конструкторе (`dto.files`) — он же
     *    уходит в поля сделки, см. InitSupplyDealFileFieldsService.
     */
    private async resolveFileValue(
        item: SupplyReportDto,
        dto: InitSupplyDto,
    ): Promise<[string, string] | null> {
        const smartUrl = (item.value as SmartFieldDto)?.urlMachine;
        if (smartUrl) {
            return await this.fileService.downloadBitrixFileAndConvertToBase64(
                smartUrl,
                item.name,
            );
        }

        // фронт присылает downloadUrl; в DTO поле исторически названо downLoadUrl
        const dealValue = item.value as Partial<DealFieldDto> & {
            downloadUrl?: string;
        };
        const dealUrl = dealValue?.downloadUrl || dealValue?.downLoadUrl;
        if (dealUrl) {
            return await this.fileService.downloadPortalFileAndConvertToBase64(
                dto.domain,
                dealUrl,
                item.name,
            );
        }

        const uploaded = dto.files?.find(file => file.code === item.code);
        if (uploaded?.base64) {
            return [uploaded.filename, uploaded.base64];
        }

        return null;
    }
}
