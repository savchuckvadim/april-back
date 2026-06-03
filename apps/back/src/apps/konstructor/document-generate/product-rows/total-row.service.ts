import { ProductRowDto } from '../dto/product-row/product-row.dto';
import { Injectable } from '@nestjs/common';
import { ClientTypeEnum } from '../type/client.type';
import { formatRuble, formatMoney, getCaseMonthes } from '../lib/rubles.util';

interface IContractTotalRowData {
    total_product_name: string;
    total_month_sum: string;
    total_month_sum_string: string;
    total_measure: string;
}
export interface ITotalRowData extends IContractTotalRowData {
    total_prepayment_quantity: number;
    total_prepayment_quantity_string: string;
    total_prepayment_sum: string;
    total_prepayment_sum_string: string;
    total_product_quantity: number;
    total_product_quantity_string: string;
    total_month_quantity: number;
    total_month_quantity_string: string;
    contract_total_sum: string;
    contract_total_sum_string: string;
    with_tax: boolean;
    tax_sum: string;
    tax_sum_string: string;
    total_full_string: string;
    total_discount_sum: string;
    total_discount_sum_string: string;
    total_discount_sum_month: string;
    total_discount_sum_month_string: string;
    contract_total_sum_without_tax: string;
    contract_total_sum_without_tax_string: string;
}
interface IZofferTotalRowData {
    totalProductName: string;
    supplyShortName: string;
    supplyFullName: string;
    totalSumMonth: number;
    totalSum: number;
    totalQuantity: number;
    totalMeasure: string;
}
@Injectable()
export class DocumentTotalRowService {
    getZofferData(total: ProductRowDto): IZofferTotalRowData {
        const totalPrice = total.price;

        const totalProductName = total.name;
        const supplyShortName = total.currentSupply.name;
        const supplyFullName = total.currentSupply.quantityForKp;
        const totalSumMonth = Number(
            (totalPrice.month / total.product.contractCoefficient).toFixed(2),
        );
        const totalSum = Number(
            (totalPrice.sum / total.product.contractCoefficient).toFixed(2),
        );
        const totalQuantity = Number(
            (totalPrice.quantity * total.product.contractCoefficient).toFixed(
                2,
            ),
        );
        const totalMeasure = 'мес.'; // totalPrice.measure.name

        return {
            totalProductName,
            supplyShortName,
            supplyFullName,
            totalSumMonth,
            totalSum,
            totalQuantity,
            totalMeasure,
        };
    }

    public getContractData(
        total: ProductRowDto,
        clientType: ClientTypeEnum,
        withTax: boolean,
    ): ITotalRowData {
        const contractSumNum = Number(total.price.sum.toFixed(2));
        const totalSumMonthNum = Number(total.price.current.toFixed(2));

        const contractSum = formatMoney(contractSumNum);
        const totalSumMonth = formatMoney(totalSumMonthNum);

        const productQuantity = total.price.quantity;
        const productQuantityString =
            this.getMonthWithTitleAccusative(productQuantity);
        const productContractCoefficient = total.product.contractCoefficient;
        const totalMonthQuantity = productQuantity * productContractCoefficient;

        const totalMonthQuantityString =
            this.getMonthWithTitleAccusative(totalMonthQuantity);

        const contractSumString = `(${formatRuble(contractSumNum)})`;
        const totalSumMonthString = `(${formatRuble(totalSumMonthNum)})`;

        const taxSumNum = withTax
            ? Number(((Number(total.price.sum) * 5) / 105).toFixed(2))
            : 0;
        const taxSum = withTax ? formatMoney(taxSumNum) : '';
        const taxSumString = withTax ? `(${formatRuble(taxSumNum)})` : '';
        const contractSumWithoutTaxNum = withTax
            ? Number((contractSumNum - taxSumNum).toFixed(2))
            : contractSumNum;
        const contractSumWithoutTax = formatMoney(contractSumWithoutTaxNum);

        const contractSumWithoutTaxString = withTax
            ? `(${formatRuble(contractSumWithoutTaxNum)})`
            : '';

        // precent — коэффициент цены после скидки к базе (0.8 → скидка = contractSum * (1/precent - 1)).
        const precent = total.price.discount.precent;
        const totalDiscountSumNum =
            precent > 0 && precent < 1
                ? Number((contractSumNum * (1 / precent - 1)).toFixed(2))
                : 0;
        const totalDiscountSum = formatMoney(totalDiscountSumNum);
        const totalDiscountSumString = `(${formatRuble(totalDiscountSumNum)})`;

        const totalDiscountSumMonthNum =
            precent > 0 && precent < 1
                ? Number((totalSumMonthNum * (1 / precent - 1)).toFixed(2))
                : 0;
        const totalDiscountSumMonth = formatMoney(totalDiscountSumMonthNum);
        const totalDiscountSumMonthString = `(${formatRuble(totalDiscountSumMonthNum)})`;
        const totalFullString = this.getTotalFullString(
            contractSumNum,
            taxSumNum,
            withTax,
        );

        let result = {
            total_product_name: total.name,
            total_month_sum: totalSumMonth,
            total_month_sum_string: totalSumMonthString,
            total_measure: total.price.measure.name,
        } as IContractTotalRowData;

        if (clientType === ClientTypeEnum.ORG_STATE) {
            result = {
                ...result,
                total_prepayment_quantity: 1,
                total_prepayment_quantity_string: '1 месяц',
                total_prepayment_sum: totalSumMonth,
                total_prepayment_sum_string: totalSumMonthString,
                contract_total_sum: contractSum,
                contract_total_sum_string: contractSumString,
                total_month_quantity: totalMonthQuantity,
                total_month_quantity_string: totalMonthQuantityString,
                total_product_quantity: productQuantity,
                total_product_quantity_string: productQuantityString,
                tax_sum: taxSum,
                tax_sum_string: taxSumString,
                contract_total_sum_without_tax: contractSumWithoutTax,
                contract_total_sum_without_tax_string:
                    contractSumWithoutTaxString,
                total_full_string: totalFullString,
                total_discount_sum: totalDiscountSum,
                total_discount_sum_string: totalDiscountSumString,
                total_discount_sum_month: totalDiscountSumMonth,
                total_discount_sum_month_string: totalDiscountSumMonthString,
            } as ITotalRowData;
        } else {
            result = {
                ...result,
                total_prepayment_quantity: totalMonthQuantity,
                total_prepayment_quantity_string: totalMonthQuantityString,
                total_prepayment_sum: contractSum,
                total_prepayment_sum_string: contractSumString,
                contract_total_sum: contractSum,
                contract_total_sum_string: contractSumString,
                total_month_quantity: totalMonthQuantity,
                total_month_quantity_string: totalMonthQuantityString,
                total_product_quantity: productQuantity,
                total_product_quantity_string: productQuantityString,
                tax_sum: taxSum,
                tax_sum_string: taxSumString,
                contract_total_sum_without_tax: contractSumWithoutTax,
                contract_total_sum_without_tax_string:
                    contractSumWithoutTaxString,
                total_full_string: totalFullString,
                total_discount_sum: totalDiscountSum,
                total_discount_sum_string: totalDiscountSumString,
                total_discount_sum_month: totalDiscountSumMonth,
                total_discount_sum_month_string: totalDiscountSumMonthString,
            } as ITotalRowData;
        }

        return result as ITotalRowData;
    }

    private getTotalFullString(
        contractSumNum: number,
        taxSumNum: number,
        withTax: boolean,
    ): string {
        const contractSum = formatMoney(contractSumNum);
        const taxSum = formatMoney(taxSumNum);
        if (withTax) {
            return `${contractSum} руб. (${formatRuble(contractSumNum)}), в том числе НДС 5% ${taxSum} (${formatRuble(taxSumNum)}), на основании подпункта 1 пункта 8 статьи 164 НК РФ.`;
        } else {
            return `${contractSum} руб. (${formatRuble(contractSumNum)})`;
        }
    }

    private getSupplyReportData(total: ProductRowDto) {
        const productQuantity = total.price.quantity;
        const productContractCoefficient = total.product.contractCoefficient;
        const totalQuantity = productQuantity * productContractCoefficient;

        const contractSum = Number(total.price.sum).toFixed(2);
        const totalSumCurrent = total.price.current;
        const totalSumMonth = Number(
            (totalSumCurrent / productContractCoefficient).toFixed(2),
        );

        const totalQuantityString =
            this.getMonthWithTitleAccusative(totalQuantity);

        const contractSumString = `(${formatRuble(Number(contractSum))})`;
        const totalSumMonthString = `(${formatRuble(Number(totalSumMonth))})`;

        return {
            total_product_name: total.name,
            total_supply_name: total.supply?.name || '',
            total_prepayment_quantity: totalQuantity,
            total_prepayment_quantity_string: totalQuantityString,
            total_prepayment_sum: contractSum,
            total_prepayment_sum_string: contractSumString,
            contract_total_sum: contractSum,
            contract_total_sum_string: contractSumString,
            total_quantity: totalQuantity,
            total_quantity_string: totalQuantityString,
            total_month_sum: totalSumMonth,
            total_month_sum_string: totalSumMonthString,
            total_measure: total.price.measure.name,
        };
    }

    private getMonthWithTitleAccusative(quantity: number): string {
        const casedMonthTitle = getCaseMonthes(quantity);
        return `${quantity} ${casedMonthTitle}`;
    }
}
