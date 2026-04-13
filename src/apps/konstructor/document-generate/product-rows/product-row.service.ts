import { Injectable } from '@nestjs/common';
import { ProductRowDto } from '../dto/product-row/product-row.dto';
import { ClientTypeEnum } from '../type/client.type';
import { formatRuble, formatMoney, getCaseMonthes } from '../lib/rubles.util';

export interface Product {
    productNumber: number;
    productName: string;
    productQuantity: number;
    productMeasure: string;
    productPrice: string;
    productSum: string;
    productSumString: string;
    productMonthSum: string;
    productMonthSumString: string;
    productDiscountSum: string;
    productDiscountSumString: string;
    productDiscountSumMonth: string;
    productDiscountSumStringMonth: string;
    complect_sup?: string;
    complectName?: string;
    productPriceDefault?: string;
    productSumDefault?: string;
    discountPercent?: number;
    discountAmount?: number;
    taxSum?: string;
    taxSumString?: string;
    quantityString: string;
    productContractName: string;
    supplyNameMarketing: string;
    supplyNameString: string;
    productWithContractName: string;
    monthQuantityString: string;
    contractFullName: string;
}

@Injectable()
export class DocumentProductRowService {
    public getProducts(
        arows: ProductRowDto[],
        contractName: string,
        isProduct: boolean,
        contractCoefficient: number,
        clientType: ClientTypeEnum,
    ): Product[] {
        const contractFullName = isProduct
            ? `${contractName} длительность ${contractCoefficient} мес.`
            : contractName;
        const products: Product[] = [];

        for (let i = 0; i < arows.length; i++) {
            const row = arows[i];
            const productQuantity =
                clientType === ClientTypeEnum.ORG_STATE
                    ? 1
                    : row.price.quantity;
            const monthQuantity = productQuantity * contractCoefficient;
            const monthQuantityString = getCaseMonthes(monthQuantity);

            const productSumDefaultNum = Number(
                (row.price.default * row.price.quantity).toFixed(2),
            );
            const productSumDefault = formatMoney(productSumDefaultNum);

            const productSumNum = Number(row.price.sum.toFixed(2));
            const productSum = formatMoney(productSumNum);
            const productSumString = formatRuble(productSumNum);
            const productMonthSumNum = Number(row.price.month.toFixed(2));
            const productMonthSum = formatMoney(productMonthSumNum);
            const productMonthSumString = formatRuble(productMonthSumNum);

            const productPriceDefault = formatMoney(
                Number(row.price.default.toFixed(2)),
            );
            const productPrice = formatMoney(
                Number(row.price.current.toFixed(2)),
            );

            const discountPercent = Number(
                (100 - 100 * row.price.discount.precent).toFixed(2),
            );
            const discountSumMonthNum =
                discountPercent > 0 && discountPercent < 1
                    ? Number(
                          (
                              productMonthSumNum *
                              (1 / discountPercent - 1)
                          ).toFixed(2),
                      )
                    : 0;
            const discountSumNum = Number(
                (discountSumMonthNum * monthQuantity).toFixed(2),
            );
            const discountSum = formatMoney(discountSumNum);
            const discountSumString = formatRuble(discountSumNum);
            const discountSumMonth = formatMoney(discountSumMonthNum);
            const discountSumStringMonth = formatRuble(discountSumMonthNum);

            const taxSumNum = Number(
                ((Number(row.price.sum) * 5) / 105).toFixed(2),
            );
            const taxSum = formatMoney(taxSumNum);
            const taxSumString = formatRuble(taxSumNum);

            const productContractName =
                row.product.contract.contract?.productName || '';
            const supplyNameMarketing = row.supply?.forkp || '';
            const supplyNameString = row.supply?.name || '';
            const productWithContractName = `${productContractName} ${row.product.name} ${supplyNameMarketing}`;
            const quantityString = row.product.quantityForKp || '';

            products.push({
                productNumber: i + 1,
                productName: row.name,
                productQuantity: productQuantity,
                productMeasure: row.price.measure.name,
                productPrice,
                productSum,
                productSumString,
                productMonthSum,
                productMonthSumString,
                productDiscountSum: discountSum,
                productDiscountSumMonth: discountSumMonth,
                productDiscountSumString: discountSumString,
                productDiscountSumStringMonth: discountSumStringMonth,
                productPriceDefault,
                productSumDefault,
                discountPercent,
                taxSum,
                taxSumString,
                quantityString, // интернет версия на один одновременный доступ к системе
                productContractName,
                supplyNameMarketing,
                supplyNameString,
                productWithContractName,
                monthQuantityString,
                contractFullName,
            });
        }

        return products;
    }

    // private getSupplyProducts(
    //     arows: any[],
    //     contractName: string,
    //     isProduct: boolean,
    //     contractCoefficient: number,
    //     clientType: ClientTypeEnum,
    // ): Product[] {
    //     const contractFullName = isProduct
    //         ? `${contractName} длительность ${contractCoefficient} мес.`
    //         : contractName;
    //     const products: Product[] = [];

    //     for (let i = 0; i < arows.length; i++) {
    //         const row = arows[i];
    //         const productQuantity = row.price.quantity;
    //         const productContractCoefficient = row.product.contractCoefficient;
    //         const quantity = productQuantity * productContractCoefficient;
    //         const complect_sup =
    //             row.productType === 'garant' ? row.currentSupply.name : '';

    //         const productPrice = Number(row.price.current).toFixed(2);
    //         const productSum = Number(row.price.sum).toFixed(2);
    //         const productPriceDefault = Number(row.price.default).toFixed(2);

    //         products.push({
    //             productNumber: i + 1,
    //             productName: `${contractFullName}(${row.name})`,
    //             productQuantity: productQuantity,
    //             productMeasure: row.price.measure.name,
    //             productPrice: productPrice,
    //             productSum: productSum,
    //             complect_sup: complect_sup,
    //             complectName: row.name,
    //             productPriceDefault: productPriceDefault,
    //         });
    //     }

    //     return products;
    // }
}
