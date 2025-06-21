import { IBXItem } from "src/modules/bitrix";

export interface IBXSmart<id extends string> extends IBXItem {
    entityTypeId: `${id}`
}
