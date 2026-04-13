import { Injectable } from '@nestjs/common';
import { DocumentTotalRowService } from '../../../document-generate/product-rows/total-row.service';
import { ProductRowDto } from '../../../document-generate/dto/product-row/product-row.dto';
import { ClientTypeEnum } from '../../../document-generate/type/client.type';
import { DocumentProductRowService } from '../../../document-generate/product-rows/product-row.service';

export interface IGeneralProductRenderItemData {
    GeneralProductName: string;
    GeneralProductContractName: string;
    GeneralSupplyNameMarketing: string;
    GeneralSupplyNameString: string;
    GeneralProductByContractName: string;
}

@Injectable()
export class OfferRenderGeneralProductService {
    constructor(
        private readonly documentTotalRowService: DocumentTotalRowService,
        private readonly documentProductRowService: DocumentProductRowService,
    ) {}

    public renderTotalPrice(
        total: ProductRowDto,
        contractName: string,
        contractCoefficient: number,
        clientType: ClientTypeEnum,
        withTax: boolean,
    ): IGeneralProductRenderItemData {
        const totalData = this.documentTotalRowService.getContractData(
            total,
            clientType,
            withTax,
        );
        const totalRowData = this.documentProductRowService.getProducts(
            [total],
            contractName,
            true,
            contractCoefficient,
            clientType,
        );
        const result: IGeneralProductRenderItemData = {
            GeneralProductName: totalData.total_product_name,
            GeneralProductContractName: totalRowData[0].productName,
            GeneralSupplyNameMarketing: totalRowData[0].supplyNameMarketing,
            GeneralSupplyNameString: totalRowData[0].supplyNameString,
            GeneralProductByContractName:
                totalRowData[0].productWithContractName,
        };

        return result;
    }
}
