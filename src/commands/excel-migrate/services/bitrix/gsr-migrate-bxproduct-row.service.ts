import { Injectable } from "@nestjs/common";
import { GsrMigrateBitrixAbstract } from "./gsr-migrate-bitrix-abstract.service";
import { MigrateToBxDto } from "../../dto/migrate-to-bx.dto";
import {  EBXEntity, EBxMethod, EBxNamespace } from "src/modules/bitrix";
import { IPPortalMeasure } from "src/modules/portal/interfaces/portal.interface";
import { IBXProductRow, IBXProductRowRow } from "src/modules/bitrix";
import { BitrixOwnerType } from "src/modules/bitrix/domain/enums/bitrix-constants.enum";



@Injectable()
export class GsrMigrateBitrixProductRowService extends GsrMigrateBitrixAbstract {



    getProductRowCommand(element: MigrateToBxDto, dealCommandCode: string) {
        const pMeasure = this.portal.getMeasureByCode("month") as IPPortalMeasure

        const productRowCommandCode = `${EBxNamespace.CRM_ITEM}.${EBXEntity.PRODUCT_ROW}.${EBxMethod.SET}.${element.id}`
        const productTotal = {
            ownerId: `$result[${dealCommandCode}]`,
            ownerType: BitrixOwnerType.DEAL,
            productRows: [] as IBXProductRowRow[]
        } as IBXProductRow

        element.products.forEach((product, i) => {
            const row = {
                price: Number(product.monthSum),
                quantity: product.quantity,
                productName: product.name,
                measureId: pMeasure.bitrixId,

            }
            productTotal.productRows.push(row)

        });

        this.bitrix.batch.productRow.set(
            productRowCommandCode,
            productTotal
        )
    }

    getProductRowCommandById(element: MigrateToBxDto, dealId: string) {
        const pMeasure = this.portal.getMeasureByCode("month") as IPPortalMeasure

        const productRowCommandCode = `${EBxNamespace.CRM_ITEM}.${EBXEntity.PRODUCT_ROW}.${EBxMethod.SET}.${element.id}`
        const productTotal = {
            ownerId: dealId,
            ownerType: 'D',
            productRows: [] as IBXProductRowRow[]
        } as IBXProductRow

        element.products.forEach((product, i) => {
            const row = {
                price: Number(product.monthSum),
                quantity: product.quantity,
                productName: product.name,
                measureId: pMeasure.bitrixId,

            }
            productTotal.productRows.push(row)

        });

        this.bitrix.batch.productRow.set(
            productRowCommandCode,
            productTotal
        )
    }

}
