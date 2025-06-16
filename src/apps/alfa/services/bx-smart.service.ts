import { BitrixService } from "src/modules/bitrix"; 
import { DealValue } from "./deal-helper/deal-values-helper.service";

export class BxSmartService {
    private bitrix: BitrixService
    constructor(

    ) { }

    async init(bitrix: BitrixService) {
        this.bitrix = bitrix;
    }

    public async setParticipantsSmarts(participants: DealValue[]) {
        
        const smarts = await this.bitrix.item.list('1036');
        console.log(smarts);
        return smarts;
    }   
}