import {
    BitrixOwnerType,
    BitrixService,
    IBXProductRowRow,
} from '@/modules/bitrix';
import { ListProductRowDto } from '@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto';
import { CreateActDto } from './ork-act.dto';

export class OrkActsProductRowsService {
    constructor(private readonly bitrix: BitrixService) {}

    public async migrateRowsFromDealToSmart(dto: CreateActDto) {
        const smartCrmId = this.getSmartCrmId(dto.smartCrmId, dto.smartId);

        const dealProductRows = await this.getDealProductRows(dto.dealId);
        console.log(dealProductRows);

        const smartProductRows = dealProductRows
            ? await this.setSmartProductRows(
                  dto.smartId,
                  dealProductRows,
                  dto.quantity || 1,
                  smartCrmId,
              )
            : undefined;
        console.log(smartProductRows);
    }

    public async getDealProductRows(
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
    public getDealProductRowsBatchCommand(
        dealId: number,
        // ): Promise<IBXProductRowRow[] | undefined> {
    ): void {
        const ownerType = BitrixOwnerType.DEAL;
        const getProductRowsData: ListProductRowDto = {
            '=ownerType': ownerType,
            '=ownerId': dealId,
        };
        this.bitrix.batch.productRow.list(`${dealId}`, getProductRowsData);
    }

    private async setSmartProductRows(
        smartId: number,
        productRows: IBXProductRowRow[],
        quantity: number, // количество месяцев
        smartCrmId: string,
    ): Promise<IBXProductRowRow[] | undefined> {

        const updatedProductRows = productRows.map(row => {
            let coefficient: number = 1;
            if (row.measureName?.includes('12')) {
                coefficient = 12;
            } else if (row.measureName?.includes('6')) {
                coefficient = 6;
            } else if (row.measureName?.includes('3')) {
                coefficient = 3;
            }

            return {
                ...row,
                ownerType: smartCrmId,
                ownerId: smartId,
                quantity,
                coefficient,
            } as IBXProductRowRow;
        });

        const setData = {
            ownerType: smartCrmId, // `DYNAMIC_${ACT_SMART_TYPE_ID}`,
            ownerId: smartId,
            productRows: updatedProductRows,
        };
        try {
            const response = await this.bitrix.productRow.set(setData);
            return response?.result?.productRows;
        } catch (error) {
            console.error(error);
            return undefined;
        }
    }

    private getSmartCrmId(smartCrmId: string, smartId: number): string {
        const end =
            smartCrmId.toString().length - smartId.toString().length - 1;

        const result = smartCrmId.slice(0, end);
        return result;
    }
}
