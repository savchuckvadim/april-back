import { ProductRowDto } from '../dto/product-row/product-row.dto';
import { Injectable } from '@nestjs/common';
import { ClientTypeEnum } from '../type/client.type';
import { formatRuble, getCaseMonthes } from '../lib/rubles.util';

interface IContractTotalRowData {
    total_product_name: string;
    total_month_sum: number;
    total_month_sum_string: string;
    total_measure: string;
}
export interface ITotalRowData extends IContractTotalRowData {
    total_prepayment_quantity: number;
    total_prepayment_quantity_string: string;
    total_prepayment_sum: number;
    total_prepayment_sum_string: string;
    total_product_quantity: number; // общее количество только продукта - актуально когда с ним указыывается специфичная единица например (абон.6мес)
    total_product_quantity_string: string; // общее количество продукта
    total_month_quantity: number; // общее количество месяцев пользования (количество продукта * коэффициент контракта)
    total_month_quantity_string: string; // общее количество месяцев пользования (количество продукта * коэффициент контракта)
    contract_total_sum: number;
    contract_total_sum_string: string;
    with_tax: boolean;
    tax_sum: number;
    tax_sum_string: string;
    total_full_string: string;
    total_discount_sum: number;
    total_discount_sum_string: string;
    total_discount_sum_month: number;
    total_discount_sum_month_string: string;
    contract_total_sum_without_tax: number;
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
        const contractSum = Number(total.price.sum.toFixed(2));
        const totalSumMonth = Number(total.price.current.toFixed(2));

        const productQuantity = total.price.quantity;
        const productQuantityString =
            this.getMonthWithTitleAccusative(productQuantity);
        const productContractCoefficient = total.product.contractCoefficient;
        const totalMonthQuantity = productQuantity * productContractCoefficient;

        const totalMonthQuantityString =
            this.getMonthWithTitleAccusative(totalMonthQuantity);

        const contractSumString = `(${formatRuble(Number(contractSum))})`;
        const totalSumMonthString = `(${formatRuble(Number(totalSumMonth))})`;

        const taxSum = withTax
            ? Number(((Number(total.price.sum) * 5) / 105).toFixed(2))
            : '';
        const taxSumString = withTax ? `(${formatRuble(Number(taxSum))})` : '';
        const contractSumWithoutTax = withTax
            ? Number((contractSum - Number(taxSum)).toFixed(2))
            : contractSum;

        const contractSumWithoutTaxString = withTax
            ? `(${formatRuble(Number(contractSumWithoutTax))})`
            : '';

        // precent — коэффициент цены после скидки к базе (0.8 → скидка = contractSum * (1/precent - 1)).
        const precent = total.price.discount.precent;
        const totalDiscountSum =
            precent > 0 && precent < 1
                ? Number((contractSum * (1 / precent - 1)).toFixed(2))
                : 0;
        const totalDiscountSumString = `(${formatRuble(Number(totalDiscountSum))})`;

        const totalDiscountSumMonth =
            precent > 0 && precent < 1
                ? Number((totalSumMonth * (1 / precent - 1)).toFixed(2))
                : 0;
        const totalDiscountSumMonthString = `(${formatRuble(Number(totalDiscountSumMonth))})`;
        const totalFullString = this.getTotalFullString(
            contractSum,
            taxSum,
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
        contractSum: number,
        taxSum: number | '',
        withTax: boolean,
    ): string {
        if (withTax) {
            return `${contractSum} руб. (${formatRuble(Number(contractSum))}), в том числе НДС 5% ${taxSum} (${formatRuble(Number(taxSum))}), на основании подпункта 1 пункта 8 статьи 164 НК РФ.`;
        } else {
            return `${contractSum} руб. (${formatRuble(Number(contractSum))})`;
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
