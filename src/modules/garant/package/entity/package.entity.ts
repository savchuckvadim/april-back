import { InfoblockEntity } from '../../infoblock/';
import { InfogroupEntity } from '../../infogroup/';
import { PackageProductTypeEnum, PackageTypeEnum } from '../types/package.type';

export class PackageEntity {
    id: string;
    name: string;
    fullName: string;
    shortName: string;
    description?: string;
    code: string;
    type: PackageTypeEnum;
    color?: string;
    weight?: number;
    abs?: number;
    number: number;
    productType?: PackageProductTypeEnum;
    withABS: boolean;
    isChanging: boolean;
    withDefault: boolean;
    infoblock_id?: string | null;
    info_group_id?: string | null;
    created_at?: Date;
    updated_at?: Date;

    // Relations
    infoblock?: InfoblockEntity;
    info_group?: InfogroupEntity;
}
