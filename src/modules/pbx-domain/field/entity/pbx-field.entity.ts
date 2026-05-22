import { PrismaService } from '@/core/prisma';
import { EUserFieldType } from '@/modules/bitrix';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { PbxSalesEventFieldType } from '../type/sales/event/pbx-sales-event-field.type';
import { PbxSalesKonstructorFieldType } from '../type/sales/konstructor/pbx-sales-konstructor-field.type';

export type PbxField = NonNullable<
    Awaited<ReturnType<PrismaService['bitrixfields']['findUnique']>>
>;
export type PbxFieldItem = NonNullable<
    Awaited<ReturnType<PrismaService['bitrixfield_items']['findUnique']>>
>;
export type PbxFieldWithItems = NonNullable<
    Awaited<ReturnType<PrismaService['bitrixfields']['findUnique']>>
> & {
    bitrixfield_items: PbxFieldItem[];
};

export class PbxFieldEntity {
    id?: string;
    name: string;
    title: string;
    code: string;
    type:
        | EUserFieldType
        | 'multiple'
        | PbxSalesEventFieldType
        | PbxSalesKonstructorFieldType;

    isPlural: boolean;
    bitrixId: string;
    bitrixCamelId: string;
    entity_id: number;
    entity_type: PbxEntityTypePrisma;
    parent_type: string;
    items: PbxFieldItemEntity[];
}

//actual type for install
export class PbxFieldItemEntity {
    id?: string;
    name: string;
    title: string;
    code: string;
    bitrixfield_id: number;
    bitrixId: number;
}
