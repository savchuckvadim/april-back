import { BitrixOwnerTypeId } from "../../../enums/bitrix-constants.enum";

export interface IBXCategory {
    id: number;
    name: string;
    sort?: number;
    entityTypeId: BitrixOwnerTypeId;
    isDefault?: "N" | "Y";
    originId?: string;
    originatorId?: string;
}