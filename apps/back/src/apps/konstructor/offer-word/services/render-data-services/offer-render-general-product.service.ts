import { Injectable } from '@nestjs/common';
import { DocumentTotalRowService } from '../../../document-generate/product-rows/total-row.service';
import { ProductRowDto } from '../../../document-generate/dto/product-row/product-row.dto';
import { ClientTypeEnum } from '../../../document-generate/type/client.type';
import { DocumentProductRowService } from '../../../document-generate/product-rows/product-row.service';

export interface IGeneralProductRenderItemData {
    GeneralProductName: string;
    GeneralProductContractName: string;
    GeneralSupplyUsersCount: string; //1,2,3,5
    GeneralSupplyNameMarketing: string;
    GeneralSupplyNameString: string;
    GeneralProductByContractName: string;
    GeneralProductQuantity: number; // количество основного продукта 4 (мес или лиц12)

    GeneralProductMonthQuantity: number; // количество месяцев основного продукта - то есть количество продукта * коэффициент контракта
    GeneralProductSum: string; // сумма = цена * количество
    GeneralProductMonthSum: string; // сумма в месяц = сумма / количество месяцев
    GeneralProductYearSum: string; // сумма в год = сумма в месяц * 12
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
            GeneralSupplyUsersCount: totalRowData[0].supplyUsersCount,
            GeneralSupplyNameMarketing: totalRowData[0].supplyNameMarketing,
            GeneralSupplyNameString: totalRowData[0].supplyNameString,
            GeneralProductByContractName:
                totalRowData[0].productWithContractName,

            GeneralProductQuantity: totalData.total_product_quantity,
            GeneralProductMonthQuantity: totalData.total_month_quantity,
            GeneralProductSum: totalData.total_prepayment_sum,
            GeneralProductMonthSum: totalData.total_month_sum,
            GeneralProductYearSum: (
                Number(totalData.total_month_sum) * 12
            ).toFixed(2),
        };

        return result;
    }
}
