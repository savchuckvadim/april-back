import { BitrixFieldType } from "@/apps/konstructor/document-generate/dto/pbx-items.dto";
import { PrismaService } from "@/core/prisma";
import { EUserFieldType } from "@/modules/bitrix";

export type PbxField = NonNullable<Awaited<ReturnType<PrismaService['bitrixfields']['findUnique']>>>;
export type PbxFieldItem = NonNullable<Awaited<ReturnType<PrismaService['bitrixfield_items']['findUnique']>>>;
export type PbxFieldWithItems = NonNullable<Awaited<ReturnType<PrismaService['bitrixfields']['findUnique']>>> & {
    bitrixfield_items: PbxFieldItem[];
};

export enum PbxFieldEntityType {
    SMART = 'App\\Models\\Smart',
    COMPANY = 'App\\Models\\BtxCompany',
    CONTACT = 'App\\Models\\BtxContact',
    LEAD = 'App\\Models\\Lead',
    DEAL = 'App\\Models\\Deal',
}

export class PbxFieldEntity {
    id?: string;
    name: string;
    title: string;
    code: string;
    type: BitrixFieldType | EUserFieldType | 'multiple';
  
    isPlural: boolean;
    // created_at: string;
    // updated_at: string;
    bitrixId: string;
    bitrixCamelId: string;
    entity_id: bigint;
    entity_type: PbxFieldEntityType;
    parent_type: string;
    items: PbxFieldItemEntity[];
}

export class PbxFieldItemEntity {
    id?: string;
    name: string;
    title: string;
    code: string;
    bitrixfield_id: bigint;
    bitrixId: number;
}