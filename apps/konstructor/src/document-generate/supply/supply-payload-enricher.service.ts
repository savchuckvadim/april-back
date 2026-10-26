import { Injectable } from '@nestjs/common';
import { SupplyTextService } from '@lib/garant';
import { SupplyDto } from '../../dto/supply.dto';
import { ProductRowDto } from '../dto/product-row/product-row.dto';

/**
 * Дополняет поставки в payload генерации текстами с бэка (решение 2).
 * Легаси-фронт присылает тексты сам — они сильнее; новый фронт шлёт code,
 * и пустые поля заполняются из шаблонов `supplies` по числу ОД.
 */
@Injectable()
export class SupplyPayloadEnricherService {
    constructor(private readonly supplyTexts: SupplyTextService) {}

    async enrichSupply(supply: SupplyDto): Promise<SupplyDto> {
        return this.supplyTexts.enrich(supply);
    }

    /** Строки документа: currentSupply строки, поставка товара и подпись КП. */
    async enrichRows(rows: ProductRowDto[]): Promise<ProductRowDto[]> {
        return Promise.all(rows.map(row => this.enrichRow(row)));
    }

    async enrichRow(row: ProductRowDto): Promise<ProductRowDto> {
        const currentSupply = row.currentSupply
            ? await this.enrichSupply(row.currentSupply)
            : row.currentSupply;
        const productSupply = row.product?.supply
            ? await this.enrichSupply(row.product.supply)
            : row.product?.supply;
        const quantityForKp =
            row.product?.quantityForKp ||
            (productSupply && productSupply.quantityForKp) ||
            currentSupply?.quantityForKp ||
            '';
        const supply =
            row.supply && !row.supply.forkp && quantityForKp
                ? { ...row.supply, forkp: quantityForKp }
                : row.supply;
        return {
            ...row,
            currentSupply,
            supply,
            product: row.product
                ? {
                      ...row.product,
                      supply: productSupply ?? row.product.supply,
                      quantityForKp,
                  }
                : row.product,
        };
    }
}
