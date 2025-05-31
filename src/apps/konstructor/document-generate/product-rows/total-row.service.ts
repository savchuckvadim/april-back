import { ProductRowDto } from "../dto/product-row/product-row.dto";
import { Injectable } from "@nestjs/common";
import { ClientTypeEnum } from "../type/client.type";
import { formatRuble } from "../lib/rubles.util";
@Injectable()
export class DocumentTotalRowService {

    getZofferData(total: ProductRowDto) {
        const totalPrice = total.price;


        const totalProductName = total.name
        const supplyShortName = total.currentSupply.name
        const supplyFullName = total.currentSupply.quantityForKp
        const totalSumMonth = Number((totalPrice.month / total.product.contractCoefficient).toFixed(2))
        const totalSum = Number((totalPrice.sum / total.product.contractCoefficient).toFixed(2))
        const totalQuantity = Number((totalPrice.quantity * total.product.contractCoefficient).toFixed(2))
        const totalMeasure = 'мес.' // totalPrice.measure.name

        return {
            totalProductName,
            supplyShortName,
            supplyFullName,
            totalSumMonth,
            totalSum,
            totalQuantity,
            totalMeasure
        }
    }

    getContractData(total: ProductRowDto, clientType: ClientTypeEnum) {
        const contractSum = Number(total.price.sum).toFixed(2);
        const totalSumMonth = Number(total.price.current).toFixed(2);

        const productQuantity = total.price.quantity;
        const productContractCoefficient = total.product.contractCoefficient;
        const totalQuantity = productQuantity * productContractCoefficient;

        const totalQuantityMonth = this.getMonthTitleAccusative(totalQuantity);
        const totalQuantityString = totalQuantityMonth;

        const contractSumString = `(${formatRuble(Number(contractSum))})`;
        const totalSumMonthString = `(${formatRuble(Number(totalSumMonth))})`;

        let result: any = {
            total_product_name: total.name,
            total_month_sum: totalSumMonth,
            total_month_sum_string: totalSumMonthString,
            total_measure: total.price.measure.name,
        };

        if (clientType === ClientTypeEnum.ORG_STATE) {
            result = {
                ...result,
                total_prepayment_quantity: '1',
                total_prepayment_quantity_string: '1 месяц',
                total_prepayment_sum: totalSumMonth,
                total_prepayment_sum_string: totalSumMonthString,
                total_quantity: totalQuantity,
                total_quantity_string: totalQuantityString,
                contract_total_sum: contractSum,
                contract_total_sum_string: contractSumString,
            };
        } else {
            result = {
                ...result,
                total_prepayment_quantity: totalQuantity,
                total_prepayment_quantity_string: totalQuantityString,
                total_prepayment_sum: contractSum,
                total_prepayment_sum_string: contractSumString,
                contract_total_sum: contractSum,
                contract_total_sum_string: contractSumString,
                total_quantity: totalQuantity,
                total_quantity_string: totalQuantityString,
            };
        }

        return result;
    }


    getSupplyReportData(total: any, clientType: string) {
        const productQuantity = total.price.quantity;
        const productContractCoefficient = total.product.contractCoefficient;
        const totalQuantity = productQuantity * productContractCoefficient;

        const contractSum = Number(total.price.sum).toFixed(2);
        const totalSumCurrent = total.price.current;
        const totalSumMonth = Number((totalSumCurrent / productContractCoefficient).toFixed(2));

        const totalQuantityMonth = this.getMonthTitleAccusative(totalQuantity);
        const totalQuantityString = totalQuantityMonth;

        const contractSumString = `(${formatRuble(Number(contractSum))})`;
        const totalSumMonthString = `(${formatRuble(Number(totalSumMonth))})`;

        return {
            total_product_name: total.name,
            total_supply_name: total.supply.name,
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

    private getMonthTitleAccusative(quantity: number): string {
        // TODO: Implement month title logic
        return `${quantity} месяцев`;
    }

 



}
