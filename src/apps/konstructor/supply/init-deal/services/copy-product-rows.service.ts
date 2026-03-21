import {
    BitrixService,
    IBXDealProductRowGet,
    IBXProductRowRow,
} from '@/modules/bitrix';
import { TelegramService } from '@/modules/telegram/telegram.service';

import { BitrixOwnerType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { IPSmart } from '@/modules/portal/interfaces/portal.interface';
import { ListProductRowDto } from '@/modules/bitrix/domain/crm/product-row/dto/list-product-row.sto';

export class CopyProductRowsService {
    constructor(
        private readonly oldDealId: number,
        private readonly newDealId: number,

        private readonly bitrix: BitrixService,
        // private readonly telegram: TelegramService,
    ) {}

    async copyProductFromSmartToDeal(
        serviceSmartId: number,
        portalSmart: IPSmart,
    ) {
        const smartEntityTypeId = portalSmart.entityTypeId;
        const smartCrmId = portalSmart.crm;
        const smartCrmTypeId = smartCrmId.endsWith('_')
            ? smartCrmId.slice(0, -1)
            : smartCrmId;
        console.log('smartEntityTypeId', smartEntityTypeId);
        console.log('smartCrmTypeId', smartCrmTypeId);

        const data = {
            '=ownerType': smartCrmTypeId,
            '=ownerId': serviceSmartId,
        } as ListProductRowDto;

        const getRowsResponse = await this.bitrix.productRow.list(data);

        const rows = getRowsResponse.result.productRows as IBXProductRowRow[];

        const newRows = [] as IBXProductRowRow[];
        for (const row of rows) {
            const newRow = {} as IBXProductRowRow;

            for (const key in row) {
                if (
                    key !== 'id' &&
                    key !== 'ownerId' &&
                    key !== 'ownerTypeId'
                ) {
                    newRow[key] = row[key];
                }
            }
            newRows.push(newRow);
        }
        const setRowsResponse = await this.bitrix.productRow.set({
            ownerType: BitrixOwnerType.DEAL,
            ownerId: this.newDealId,
            productRows: newRows,
        });
        const result = setRowsResponse.result;
        console.log(result);
        return result;
    }

    async copyProductFromDealToDeal() {
        const getRowsResponse = await this.bitrix.api.call(
            'crm.deal.productrows.get',
            {
                id: this.oldDealId,
            },
        );
        const rows = getRowsResponse.result as IBXDealProductRowGet[];
        console.log('rows');
        const newRows = [] as IBXDealProductRowGet[];
        for (const row of rows) {
            const newRow = {} as IBXDealProductRowGet;

            for (const key in row) {
                if (key !== 'ID') {
                    newRow[key] = row[key];
                }
            }
            newRows.push(newRow);
        }

        const setRowsResponse = await this.bitrix.api.call(
            'crm.deal.productrows.set',
            {
                id: this.newDealId,
                rows: newRows,
            },
        );
        console.log(setRowsResponse);
    }
}
