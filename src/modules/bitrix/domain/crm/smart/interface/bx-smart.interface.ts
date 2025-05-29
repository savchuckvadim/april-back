import { IBXItem } from "src/modules/bitrix";

export interface IBXSmart<ID extends string> extends IBXItem {
    entityTypeId: `SMART_ID_${ID}`
}
