import { Injectable } from '@nestjs/common';
import { DocumentTotalRowService } from '../../../document-generate/product-rows/total-row.service';
import { ProductRowDto } from '../../../document-generate/dto/product-row/product-row.dto';
import { ClientTypeEnum } from '../../../document-generate/type/client.type';
import { DocumentProductRowService } from '../../../document-generate/product-rows/product-row.service';
import { ContractDto } from '../../../dto/contract.dto';

export interface IProductRenderData {
    ProductRows: IProductRenderItemData[];
}
export interface IProductRenderItemData {
    ProductNumber: string;
    ProductName: string;
    ProductQuantity: string;
    ProductMeasure: string;
    ProductPrice: string;
    ProductSum: string;
    ProductSumString: string;
    ProductDiscountSum: string;
    ProductDiscountSumString: string;
    ProductMonthSum: string;
    ProductMonthSumString: string;
    ProductPriceDefault: string;
    ProductDiscountPercent: string;
    ProductTaxSum: string;
    ProductTaxSumString: string;
    QuantityString: string;
    ProductContractName: string;
    SupplyNameMarketing: string;
    SupplyNameString: string;
    ProductByContractName: string;
    MonthQuantityString: string;
    ContractFullName: string;
}

export interface ITotalRowItemRenderData {
    TotalProductName: string;
    TotalMonthSum: string;
    TotalMonthSumString: string;
    TotalMeasure: string;
    TotalPrepaymentQuantity: number;
    TotalPrepaymentQuantityString: string;
    TotalPrepaymentSum: string;
    TotalPrepaymentSumString: string;
    TotalSum: string;
    TotalSumString: string;
    TotalQuantity: number;
    TotalQuantityString: string;
    TotalProductQuantity: number;
    TotalProductQuantityString: string;
    TotalMonthQuantity: number;
    TotalMonthQuantityString: string;
    TaxSum: string;
    TaxSumString: string;
    TotalSumWithoutTax: string;
    TotalSumWithoutTaxString: string;
    TotalFullString: string;
    TotalDiscountSum: string;
    TotalDiscountSumString: string;
    TotalDiscountSumMonth: string;
    TotalDiscountSumMonthString: string;
    TotalTaxInvoiceInfo: string;
}

// Полностью сумма с налогом цифрами и прописью TotalFullString:
// {TotalFullString}
// Общее название всех продуктов TotalProductName
// {TotalProductName}
// Общее для всех продуктов количество месяцев TotalMonthSum
// {TotalMonthSum}
// Общее для всех продуктов количество месяцев прописью TotalMonthSumString
// {TotalMonthSumString}
// Единица измерения для всех продуктов TotalMeasure
// {TotalMeasure}
// Общее для всех продуктов количество месяцев предоплаты или заключения договора TotalPrepaymentQuantity
// {TotalPrepaymentQuantity}
// Общее для всех продуктов количество месяцев прописью или заключения договора TotalPrepaymentQuantityString
// {TotalPrepaymentQuantityString}
// Общее для всех продуктов сумма TotalPrepaymentSum
// {TotalPrepaymentSum}
// Общее для всех продуктов сумма прописью TotalPrepaymentSumString
// {TotalPrepaymentSumString}
// Общее для всех продуктов сумма в контракте ContractTotalSum
// {ContractTotalSum}
// Общее для всех продуктов сумма в контракте прописью ContractTotalSumString
// {ContractTotalSumString}
// Общее для всех продуктов количество месяцев TotalQuantity
// {TotalQuantity}
// Общее для всех продуктов количество месяцев прописью TotalQuantityString
// {TotalQuantityString}
// Общее для всех продуктов сумма налога TaxSum
// {TaxSum}
// Общее для всех продуктов сумма налога прописью TaxSumString
// {TaxSumString}

// Общая сумма скидки TotalDiscountSum
// {TotalDiscountSum}
// Общая сумма скидки прописью TotalDiscountSumString
// {TotalDiscountSumString}
// Общая сумма скидки в месяц TotalDiscountSumMonth
// {TotalDiscountSumMonth}
// Общая сумма скидки в месяц прописью TotalDiscountSumMonthString
// {TotalDiscountSumMonthString}

export interface ITotalRowRenderData {
    TotalRow: ITotalRowItemRenderData[];
}
@Injectable()
export class OfferRenderPriceService {
    constructor(
        private readonly documentTotalRowService: DocumentTotalRowService,
        private readonly documentProductRowService: DocumentProductRowService,
    ) {}

    public renderTotalPrice(
        total: ProductRowDto,
        clientType: ClientTypeEnum,
        withTax: boolean,
    ): ITotalRowRenderData {
        const totalData = this.documentTotalRowService.getContractData(
            total,
            clientType,
            withTax,
        );
        return {
            TotalRow: [
                {
                    TotalProductName: totalData.total_product_name,
                    TotalMonthSum: totalData.total_month_sum,
                    TotalMonthSumString: totalData.total_month_sum_string,
                    TotalMeasure: totalData.total_measure,
                    TotalPrepaymentQuantity:
                        totalData.total_prepayment_quantity,
                    TotalPrepaymentQuantityString:
                        totalData.total_prepayment_quantity_string,
                    TotalPrepaymentSum: totalData.total_prepayment_sum,
                    TotalPrepaymentSumString:
                        totalData.total_prepayment_sum_string,
                    TotalSum: totalData.contract_total_sum,
                    TotalSumString: totalData.contract_total_sum_string,
                    TotalSumWithoutTax:
                        totalData.contract_total_sum_without_tax,
                    TotalSumWithoutTaxString:
                        totalData.contract_total_sum_without_tax_string,
                    TotalQuantity: totalData.total_product_quantity, // тоже самое что TotalProductQuantity общее количество только продукта - актуально когда с ним указыывается специфичная единица например (абон.6мес)
                    TotalQuantityString:
                        totalData.total_product_quantity_string, // тоже самое что TotalProductQuantityString общее количество продукта
                    TotalProductQuantity: totalData.total_product_quantity, // тоже самое что TotalQuantity общее количество только продукта - актуально когда с ним указыывается специфичная единица например (абон.6мес)
                    TotalProductQuantityString:
                        totalData.total_product_quantity_string, // тоже самое что TotalQuantityString общее количество продукта

                    TotalMonthQuantity: totalData.total_month_quantity, // общее количество месяцев пользования (количество продукта * коэффициент контракта)
                    TotalMonthQuantityString:
                        totalData.total_month_quantity_string, // общее количество месяцев пользования (количество продукта * коэффициент контракта)

                    TaxSum: totalData.tax_sum,
                    TaxSumString: totalData.tax_sum_string,
                    TotalFullString: totalData.total_full_string,
                    TotalDiscountSum: totalData.total_discount_sum,
                    TotalDiscountSumString: totalData.total_discount_sum_string,
                    TotalDiscountSumMonth: totalData.total_discount_sum_month,
                    TotalDiscountSumMonthString:
                        totalData.total_discount_sum_month_string,
                    TotalTaxInvoiceInfo: withTax
                        ? 'Налог (НДС 5%)'
                        : 'Без налога (НДС)',
                },
            ] as ITotalRowItemRenderData[],
        };
    }

    public renderProductPrices(
        rows: ProductRowDto[],
        contract: ContractDto,
        clientType: ClientTypeEnum,
    ): IProductRenderData {
        const isProduct = true;
        const contractName = contract.aprilName || contract.bitrixName;
        const contractCoefficient = contract.prepayment;
        const productRowsData = this.documentProductRowService.getProducts(
            rows,
            contractName,
            isProduct,
            contractCoefficient,
            clientType,
        );
        const renderData: IProductRenderItemData[] = [];
        for (const row of productRowsData) {
            renderData.push({
                ProductNumber: row.productNumber.toString(),
                ProductName: row.productName,
                ProductQuantity: row.productQuantity.toString(),
                ProductMeasure: row.productMeasure,
                ProductPrice: row.productPrice,
                ProductSum: row.productSum,
                ProductSumString: row.productSumString,
                ProductDiscountSum: row.productDiscountSum,
                ProductDiscountSumString: row.productDiscountSumString,
                ProductMonthSum: row.productMonthSum,
                ProductMonthSumString: row.productMonthSumString,
                ProductPriceDefault: row.productPriceDefault || '',
                ProductDiscountPercent: row.discountPercent?.toString() || '',
                ProductTaxSum: row.taxSum || '',
                ProductTaxSumString: row.taxSumString || '',
                QuantityString: row.quantityString,
                ProductContractName: row.productContractName,
                SupplyNameMarketing: row.supplyNameMarketing,
                SupplyNameString: row.supplyNameString,
                ProductByContractName: row.productWithContractName,
                MonthQuantityString: row.monthQuantityString,
                ContractFullName: row.contractFullName,
            });
        }

        return {
            ProductRows: renderData,
        };
    }
}
