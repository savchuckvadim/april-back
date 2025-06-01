import { InfoblockEntity } from "../infoblock/infoblock.entity";

export class ComplectEntity {
    id: string;
    name: string;
    fullName: string;
    shortName: string;
    description?: string;
    code: string;
    type: string;
    color?: string;
    weight: number;
    abs?: string;
    number: number;
    productType: string;
    withABS: boolean;
    withConsalting: boolean;
    withServices: boolean;
    withLt: boolean;
    isChanging: boolean;
    withDefault: boolean;
    created_at?: Date;
    updated_at?: Date;
    infoblocks?: InfoblockEntity[];
} 