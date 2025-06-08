import { InfogroupEntity } from "../infogroup/infogroup.entity";

export class InfoblockEntity {
    id: string;
    number: number;
    name: string;
    title: string | null;
    description: string | null;
    descriptionForSale: string | null;
    shortDescription: string | null;
    weight: string;
    code: string;
    inGroupId: string | null;
    group_id: string;
    isLa: boolean;
    isFree: boolean;
    isShowing: boolean;
    isSet: boolean;
    isProduct: boolean | null;
    isPackage: boolean | null;
    tag: string | null;
    parent_id: string | null;
    relation_id: string | null;
    related_id: string | null;
    excluded_id: string | null;
    created_at: Date | null;
    updated_at: Date | null;

    // Relations
    group?: InfogroupEntity;
    parent?: InfoblockEntity;
    relation?: InfoblockEntity;
    related?: InfoblockEntity;
    excluded?: InfoblockEntity;
    packages?: InfoblockEntity[];
    packageInfoblocks?: InfoblockEntity[];
}


export class InfoblockLightEntity {
    id: string;
    number: number;
    name: string;
    title: string | null;
    // description: string | null;
    // descriptionForSale: string | null;
    // shortDescription: string | null;
    weight: string;
    code: string;
    inGroupId: string | null;
    group_id: string;
    isLa: boolean;
    isFree: boolean;
    isShowing: boolean;
    isSet: boolean;
    isProduct: boolean | null;
    isPackage: boolean | null;
    tag: string | null;
    // parent_id: string | null;
    // relation_id: string | null;
    // related_id: string | null;
    // excluded_id: string | null;
    // created_at: Date | null;
    // updated_at: Date | null;

    // Relations
    group?: string | null;
    // parent?: InfoblockEntity;
    // relation?: InfoblockEntity;
    // related?: InfoblockEntity;
    // excluded?: InfoblockEntity;
    // packages?: InfoblockEntity[];
    // packageInfoblocks?: InfoblockEntity[];
}
