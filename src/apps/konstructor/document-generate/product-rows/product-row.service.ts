import { Injectable } from "@nestjs/common";
import { ProductRowDto } from "../dto/product-row/product-row.dto";
import { ClientTypeEnum } from "../type/client.type";


export interface Product {
    productNumber: number;
    productName: string;
    productQuantity: number;
    productMeasure: string;
    productPrice: number | string;
    productSum: number | string;
    complect_sup?: string;
    complectName?: string;
    productPriceDefault?: string;
}

@Injectable()
export class DocumentProductRowService {


    public getProducts(arows: ProductRowDto[], contractName: string, isProduct: boolean, contractCoefficient: number, clientType: ClientTypeEnum): Product[] {
        const contractFullName = isProduct ? `${contractName} длительность ${contractCoefficient} мес.` : contractName;
        const products: Product[] = [];

        for (let i = 0; i < arows.length; i++) {
            const row = arows[i];
            const productQuantity = clientType === ClientTypeEnum.ORG_STATE ? 1 : row.price.quantity;

            products.push({
                productNumber: i + 1,
                productName: `${contractFullName}(${row.name})`,
                productQuantity: productQuantity,
                productMeasure: row.price.measure.name,
                productPrice: row.price.current,
                productSum: row.price.sum,
            });
        }

        return products;
    }

    private getSupplyProducts(arows: any[], contractName: string, isProduct: boolean, contractCoefficient: number, clientType: ClientTypeEnum): Product[] {
        const contractFullName = isProduct ? `${contractName} длительность ${contractCoefficient} мес.` : contractName;
        const products: Product[] = [];

        for (let i = 0; i < arows.length; i++) {
            const row = arows[i];
            const productQuantity = row.price.quantity;
            const productContractCoefficient = row.product.contractCoefficient;
            const quantity = productQuantity * productContractCoefficient;
            const complect_sup = row.productType === 'garant' ? row.currentSupply.name : '';

            const productPrice = Number(row.price.current).toFixed(2);
            const productSum = Number(row.price.sum).toFixed(2);
            const productPriceDefault = Number(row.price.default).toFixed(2);

            products.push({
                productNumber: i + 1,
                productName: `${contractFullName}(${row.name})`,
                productQuantity: productQuantity,
                productMeasure: row.price.measure.name,
                productPrice: productPrice,
                productSum: productSum,
                complect_sup: complect_sup,
                complectName: row.name,
                productPriceDefault: productPriceDefault,
            });
        }

        return products;
    }

}
