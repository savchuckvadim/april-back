import { InfoblockEntity } from '../infoblock/infoblock.entity';
import {
    ComplectProductTypeEnum,
    ComplectTypeEnum,
} from './types/complect.type';

export class ComplectEntity {
    id: string;
    name: string;
    fullName: string;
    shortName: string;
    description?: string;
    code: string;
    type: ComplectTypeEnum;
    color?: string;
    weight: number;
    abs?: string;
    number: number;
    productType: ComplectProductTypeEnum;
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
