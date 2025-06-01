import { InfoblockEntity } from "../infoblock/infoblock.entity";

export class InfogroupEntity {
    id: string;
    number: number;
    code: string;
    name: string;
    title: string;
    description: string | null;
    descriptionForSale: string | null;
    shortDescription: string | null;
    type: string;
    productType: string;
    created_at: Date | null;
    updated_at: Date | null;

    // Relations
    infoblocks?: InfoblockEntity[];
} 