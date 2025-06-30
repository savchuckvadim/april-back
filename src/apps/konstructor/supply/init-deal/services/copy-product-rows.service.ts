import {  BitrixService, IBXProductRowRow } from "@/modules/bitrix";
import { TelegramService } from "@/modules/telegram/telegram.service";
import { Injectable } from "@nestjs/common";
import { BitrixOwnerType } from "@/modules/bitrix/domain/enums/bitrix-constants.enum";

export class CopyProductRowsService {

    constructor(
        private readonly oldDealId: number,
        private readonly newDealId: number,
        private readonly domain: string,
        private readonly bitrix: BitrixService,
        private readonly telegram: TelegramService,
    ) { }

    async copyProductRows() {
        const getRowsResponse = await this.bitrix.api.call(
            'crm.deal.productrows.list',
            {
                id: this.oldDealId,
            }
        )
        const rows = getRowsResponse.result.rows as IBXProductRowRow[]
        // for (const row of rows) {
            await this.bitrix.productRow.set({
                ownerId: this.newDealId,
                ownerType: BitrixOwnerType.DEAL,
                productRows: rows.map(row => ({
                    ...row,
                    ownerId: this.newDealId,
                    ownerType: BitrixOwnerType.DEAL,
                }))
            })
        // }
    }

}