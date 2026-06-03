export interface Stage {
    id: string;
    entityTypeId: string;
    entityType: string;
    parentType: string;
    type: string;
    group: string;
    name: string;
    title: string;
    bitrixId: string;
    isActive: boolean;
    smartBitrixId: string;
    color: string;
    code: string;
    isNeedUpdate: boolean;
    order: number;
    bitrixEnitiyId: string;
    isDefault: 'Y' | 'N';
}

export interface Category {
    id: string;
    entityTypeId: string;
    entityType: string;
    type: string;
    group: string;
    name: string;
    title: string;
    bitrixId: string;
    bitrixCamelId: string;
    code: string;
    isActive: boolean;
    isNeedUpdate: boolean;
    order: number;
    isDefault: boolean;
    stages: Stage[];
}
