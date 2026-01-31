import { Injectable } from "@nestjs/common";
import { CreateActDto } from "../ork-act.dto";
import { PBXService } from "@/modules/pbx";
import { BitrixOwnerType, BitrixService, IBXProductRowRow } from "@/modules/bitrix";
import { ListProductRowDto } from "@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto";

const ACT_SMART_TYPE_ID = `1044`;
const ACT_SMART_ID = 13;
// const SMART_GENERAL_CATEGORY_ID = 21;
@Injectable()
export class OrkOnActCloseUseCase {
    private bitrix: BitrixService;
    constructor(private readonly pbx: PBXService) { }
    async init(bitrix: BitrixService) {
        this.bitrix = bitrix;
    }

    async closeAct(dto: CreateActDto) {
        console.log(dto);
        const { bitrix } = await this.pbx.init(dto.domain);
        await this.init(bitrix);
        const smartCrmId = this.getSmartCrmId(dto.smartCrmId, dto.smartId);


        const currentSmartResponse = await bitrix.item.get(
            dto.smartId,
            `${dto.smartTypeId}`
        );
        const currentSmart = currentSmartResponse.result.item;
        const succeededSmartsResponse = await bitrix.item.list(
            `${dto.smartTypeId}`,
            {
                parentId2: dto.dealId,
                '@stageId': [`DT${dto.smartTypeId}_${dto.smartCategoryId}:SUCCESS`]
            }
        );
        const succeededSmarts = succeededSmartsResponse.result.items;

        if (!succeededSmarts.find(smart => smart.id === currentSmart.id)) {
            succeededSmarts.push(currentSmart);
        }
        let closedCount = 0;
        for (const smart of succeededSmarts) {
            const smartProductCount = Number(smart.ufCrm13ProductCount)

            closedCount += smartProductCount;
        }

        console.log('succeededSmarts', succeededSmarts);

        const {
            rows: dealProductRows,
            currentQuantity: quantityBtCurrentDeal,
        } = await this.getDealProductRows(dto.dealId);


        const smartProductRows = dealProductRows
            ? await this.setDealProductRows(
                dto.dealId,
                dealProductRows,
                closedCount || 1,
                quantityBtCurrentDeal,
            )
            : undefined;
        console.log(smartProductRows);

        const actStatuses = await bitrix.status.getList({
            ENTITY_ID: `${dto.smartTypeId}`
        })
        console.log(actStatuses);
        return { result: true };
    }

    private getSmartCrmId(smartCrmId: string, smartId: number): string {
        const end = smartCrmId.toString().length - smartId.toString().length - 1;

        const result = smartCrmId.slice(0, end);
        return result;
    }
    private async getDealProductRows(
        dealId: number,
    ): Promise<{
        rows: IBXProductRowRow[] | undefined
        currentQuantity: number
    }> {

        const getProductRowsData: ListProductRowDto = {
            '=ownerType': BitrixOwnerType.DEAL,
            '=ownerId': dealId,
        };
        const response = await this.bitrix.productRow.list(getProductRowsData);
        const rows = response?.result?.productRows;
        const currentQuantity = Number(rows?.[0]?.quantity);
        return {
            rows,
            currentQuantity,
        };
    }


    private async setDealProductRows(
        dealId: number,
        productRows: IBXProductRowRow[],
        quantityByActs: number,
        quantityBtCurrentDeal: number,

    ): Promise<IBXProductRowRow[] | undefined> {

        if (quantityByActs <= quantityBtCurrentDeal) {
            return undefined;
        }



        const updatedProductRows = productRows.map(row => {
            return {

                ...row,
                quantity: quantityByActs,
            };
        });

        const setData = {
            ownerType: BitrixOwnerType.DEAL, // `DYNAMIC_${ACT_SMART_TYPE_ID}`,
            ownerId: dealId,
            productRows: updatedProductRows,
        }

        try {
            const response = await this.bitrix.productRow.set(setData);
            console.log(response);
            return response?.result?.productRows;
        } catch (error) {
            console.error(error);
            return undefined;
        }

    }
}
