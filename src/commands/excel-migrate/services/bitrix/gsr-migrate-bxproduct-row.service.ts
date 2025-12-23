import { Injectable } from '@nestjs/common';
import { GsrMigrateBitrixAbstract } from './gsr-migrate-bitrix-abstract.service';
import { MigrateToBxDto } from '../../dto/migrate-to-bx.dto';
import { EBXEntity, EBxMethod, EBxNamespace } from 'src/modules/bitrix';
import { IPPortalMeasure } from 'src/modules/portal/interfaces/portal.interface';
import { IBXProductRow, IBXProductRowRow } from 'src/modules/bitrix';
import { BitrixOwnerType } from 'src/modules/bitrix/domain/enums/bitrix-constants.enum';

@Injectable()
export class GsrMigrateBitrixProductRowService extends GsrMigrateBitrixAbstract {
    /**
     * Преобразует строку с ценой в число, убирая пробелы и другие форматирующие символы
     * Примеры: "15 700" -> 15700, "9532" -> 9532, "1 234.56" -> 1234.56
     */
    private parsePrice(priceString: string): number {
        if (!priceString) return 0;

        // Убираем все пробелы и заменяем запятую на точку для десятичных чисел
        const cleaned = String(priceString)
            .replace(/\s+/g, '') // Убираем все пробелы
            .replace(/,/g, '.'); // Заменяем запятую на точку

        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    }

    getProductRowCommand(element: MigrateToBxDto, dealCommandCode: string) {
        const pMeasure = this.portal.getMeasureByCode(
            'month',
        ) as IPPortalMeasure;

        const productRowCommandCode = `${EBxNamespace.CRM_ITEM}.${EBXEntity.PRODUCT_ROW}.${EBxMethod.SET}.${element.id}`;
        const productTotal = {
            ownerId: `$result[${dealCommandCode}]`,
            ownerType: BitrixOwnerType.DEAL,
            productRows: [] as IBXProductRowRow[],
        } as IBXProductRow;

        element.products.forEach((product, i) => {
            const row = {
                price: this.parsePrice(product.monthSum),
                quantity: product.quantity,
                productName: product.name,
                measureId: pMeasure.bitrixId,
            };
            productTotal.productRows.push(row);
        });

        this.bitrix.batch.productRow.set(productRowCommandCode, productTotal);
    }
    async getProductRowSetByDealId(element: MigrateToBxDto, dealId: string) {
        const pMeasure = this.portal.getMeasureByCode(
            'month',
        ) as IPPortalMeasure;

        const productRowCommandCode = `${EBxNamespace.CRM_ITEM}.${EBXEntity.PRODUCT_ROW}.${EBxMethod.SET}.${element.id}`;
        const productTotal = {
            ownerId: `${dealId}`,
            ownerType: BitrixOwnerType.DEAL,
            productRows: [] as IBXProductRowRow[],
        } as IBXProductRow;

        element.products.forEach((product, i) => {
            const row = {
                price: this.parsePrice(product.monthSum),
                quantity: product.quantity,
                productName: product.name,
                measureId: pMeasure.bitrixId,
            };
            productTotal.productRows.push(row);
        });

        this.bitrix.batch.productRow.set(productRowCommandCode, productTotal);
        await this.bitrix.api.callBatchWithConcurrency()
    }
    getProductRowCommandById(element: MigrateToBxDto, dealId: string) {
        const pMeasure = this.portal.getMeasureByCode(
            'month',
        ) as IPPortalMeasure;

        const productRowCommandCode = `${EBxNamespace.CRM_ITEM}.${EBXEntity.PRODUCT_ROW}.${EBxMethod.SET}.${element.id}`;
        const productTotal = {
            ownerId: dealId,
            ownerType: 'D',
            productRows: [] as IBXProductRowRow[],
        } as IBXProductRow;

        element.products.forEach((product, i) => {
            const row = {
                price: this.parsePrice(product.monthSum),
                quantity: product.quantity,
                productName: product.name,
                measureId: pMeasure.bitrixId,
            };
            productTotal.productRows.push(row);
        });

        this.bitrix.batch.productRow.set(productRowCommandCode, productTotal);
    }
}
