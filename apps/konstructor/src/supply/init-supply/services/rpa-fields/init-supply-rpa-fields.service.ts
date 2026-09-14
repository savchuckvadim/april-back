import { Injectable } from '@nestjs/common';

import { InitSupplyDto } from '../../dto/init-supply.dto';
import { buildInitSupplyFlowFields } from '../../lib/init-supply-flow-fields';
import { buildVariantLinksField } from '../../lib/init-supply-variants';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BitrixService, IBxRpaItem } from '@lib/bitrix';
import { InitSupplyRpaPbxItemsFieldsService } from './pbx-items-fields.service';
import { InitSupplyRpaSupplyReportFieldsService } from './supply-report-fields.service';
import { InitSupplyRpaRqFieldsService } from './rq-fields.service';
import { InitSupplyRpaCrmFieldsService } from './crm-fields.service';
import { InitSupplyRpaSupplyReportFileFieldService } from './supply-report-file-field.service';

@Injectable()
export class InitSupplyRpaFieldsService {
    constructor(
        private readonly initSupplyRpaPbxItemsFieldsService: InitSupplyRpaPbxItemsFieldsService,
        private readonly initSupplyRpaSupplyReportFieldsService: InitSupplyRpaSupplyReportFieldsService,
        private readonly initSupplyRpaRqFieldsService: InitSupplyRpaRqFieldsService,
        private readonly initSupplyRpaCrmFieldsService: InitSupplyRpaCrmFieldsService,
        private readonly initSupplyRpaSupplyReportFileFieldService: InitSupplyRpaSupplyReportFileFieldService,
    ) {}
    public async getRpaFields(
        dto: InitSupplyDto,
        PortalModel: PortalModel,
        bitrix: BitrixService,
    ) {
        // название заявки, галка «Перезаключение» и тип договора: по ним отдел
        // сервиса отличает поставку от перезаключения и фильтрует заявки
        const flowFields = buildInitSupplyFlowFields(dto, {
            nameField: PortalModel.getRpaFieldBitrixIdByCode('supply', 'name'),
            extensionField: PortalModel.getRpaFieldBitrixIdByCode(
                'supply',
                'is_extension',
            ),
            contractTypeField: PortalModel.getRpaFieldBitrixIdByCode(
                'supply',
                'contract_type',
            ),
        });
        const rpaCurrentSupplyReportValues =
            await this.initSupplyRpaSupplyReportFileFieldService.get(
                dto,
                PortalModel,
            );
        const bxCompanyItemsRpaValues =
            await this.initSupplyRpaPbxItemsFieldsService.get(dto, PortalModel);
        const bxDealItemsRpaValues =
            await this.initSupplyRpaPbxItemsFieldsService.get(dto, PortalModel);
        const supplyReportRpaValues =
            await this.initSupplyRpaSupplyReportFieldsService.get(
                dto,
                PortalModel,
            );
        const bxrqValues = await this.initSupplyRpaRqFieldsService.get(
            dto,
            PortalModel,
        );
        const crmRelationsRpaValues =
            await this.initSupplyRpaCrmFieldsService.get(
                dto,
                PortalModel,
                bitrix,
            );

        // ссылки на элементы вариантов — если поле на портале заведено
        const variantLinks = buildVariantLinksField(dto, PortalModel);

        const rpaFields = {
            ...flowFields,
            ...variantLinks,
            ...rpaCurrentSupplyReportValues,

            // [`${rpaCommentField}`]: '🎯 Перезаключение ТЕСТ',
            ...bxCompanyItemsRpaValues,
            ...bxDealItemsRpaValues,
            ...supplyReportRpaValues,
            ...bxrqValues,
            ...crmRelationsRpaValues,
        } as Partial<IBxRpaItem>;

        return rpaFields;
    }
}
