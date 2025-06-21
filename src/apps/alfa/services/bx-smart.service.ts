import { BitrixService } from "src/modules/bitrix"; 
import { DealValue } from "./deal-helper/deal-values-helper.service";
import { IAlfaParticipantSmartItem } from "../bx-data/bx-smart-data";
import { EntityTypeId, StageId } from "../dto/smart-item.dto";



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

    public async getList(entityTypeId: string) {
        
        const smarts = await this.bitrix.item.list(entityTypeId);
        console.log(smarts);
        return smarts;
    }  

    public async add(entityTypeId: EntityTypeId, item: IAlfaParticipantSmartItem<1036, 26, StageId>) {
        
        const smarts = await this.bitrix.item.add(entityTypeId as unknown as string, item);
        console.log(smarts);
        return smarts;
    }  
}