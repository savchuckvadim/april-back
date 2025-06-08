import { InfoblockEntity } from "../infoblock/infoblock.entity";

export enum InfogroupType {
    INFOBLOCKS = 'infoblocks',
    FREE = 'free',
    LT = 'lt',
    ER = 'er',
    CONSALTING = 'consalting',
}
export enum InfogroupProductType {
    GARANT = 'garant',
    LT = 'lt',
    CONSALTING = 'consalting',
}
export class InfogroupEntity {
    id: string;
    number: number;
    code: string;
    name: string;
    title: string;
    description: string | null;
    descriptionForSale: string | null;
    shortDescription: string | null;
    type: InfogroupType;
    productType: InfogroupProductType;
    created_at: Date | null;
    updated_at: Date | null;

    // Relations
    infoblocks?: InfoblockEntity[];
} 