import { BitrixOwnerType, BitrixService, IBXProductRowRow } from "@/modules/bitrix";
import { ListProductRowDto } from "@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto";
import { CreateActDto } from "../ork-act.dto";

export class OrkOnActCreateProductRowService {
    constructor(
        private readonly bitrix: BitrixService
    ) { }

    public async migrateRowsFromDealToSmart(
        dto: CreateActDto
    ) {
        const smartCrmId = this.getSmartCrmId(dto.smartCrmId, dto.smartId);

        const dealProductRows = await this.getDealProductRows(dto.dealId);
        console.log(dealProductRows);

        const smartProductRows = dealProductRows
            ? await this.setSmartProductRows(
                dto.smartId,
                dealProductRows,
                dto.quantity || 1,
                smartCrmId
            )
            : undefined;
        console.log(smartProductRows);
    }


    private async getDealProductRows(
        dealId: number,
    ): Promise<IBXProductRowRow[] | undefined> {

        const getProductRowsData: ListProductRowDto = {
            '=ownerType': BitrixOwnerType.DEAL,
            '=ownerId': dealId,
        };
        const response = await this.bitrix.productRow.list(getProductRowsData);
        console.log(response);
        return response?.result?.productRows;
    }


    private async setSmartProductRows(
        smartId: number,
        productRows: IBXProductRowRow[],
        quantity: number, // количество месяцев
        smartCrmId: string,
    ): Promise<IBXProductRowRow[] | undefined> {


        let coefficient = 1;

        const updatedProductRows = productRows.map(row => {

            if (row.measureName?.includes('12')) {
                coefficient = 12;
            } else if (row.measureName?.includes('6')) {
                coefficient = 6;
            }

            return {
                ...row,
                ownerType: smartCrmId,
                ownerId: smartId,
                quantity,
            } as IBXProductRowRow;
        });

        const setData = {
            ownerType: smartCrmId, // `DYNAMIC_${ACT_SMART_TYPE_ID}`,
            ownerId: smartId,
            productRows: updatedProductRows,
        }
        console.log('coefficient', coefficient);
        try {
            const response = await this.bitrix.productRow.set(setData);
            console.log(response);
            return response?.result?.productRows;
        } catch (error) {
            console.error(error);
            return undefined;
        }

    }


    private getSmartCrmId(smartCrmId: string, smartId: number): string {
        const end = smartCrmId.toString().length - smartId.toString().length - 1;

        const result = smartCrmId.slice(0, end);
        return result;
    }
}
