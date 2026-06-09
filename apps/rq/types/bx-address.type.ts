import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { TypeIdAddress } from './type-id-address.enum';

export class Address {
    // ближайшая родительская сущно сть - по идее Requisite 8
    ENTITY_TYPE_ID: number; // 8
    // id ближайшей родительской сущности
    ENTITY_ID: number;
    ADDRESS_1?: string | null;
    ADDRESS_2?: string | null;
    CITY?: string | null;
    POSTAL_CODE?: string | null;
    REGION?: string | null;
    PROVINCE?: string | null;
    COUNTRY?: string | null;
    TYPE_ID?: TypeIdAddress | null;
    TYPE?: string | null;
    // тип ближайшей родительской сущности CRM по идее компания 4
    ANCHOR_TYPE_ID?: number | null; // 4
    // id ближайшей родительской сущности
    ANCHOR_ID?: number | null;

    constructor(data: Partial<Address>) {
        this.ENTITY_TYPE_ID = data.ENTITY_TYPE_ID ?? 0;
        this.ENTITY_ID =
            data.ENTITY_ID != null
                ? Number(data.ENTITY_ID)
                : (BitrixOwnerTypeId.REQUISITE as number);
        this.ADDRESS_1 = data.ADDRESS_1 ?? '';
        this.ADDRESS_2 = data.ADDRESS_2 ?? '';
        this.CITY = data.CITY ?? '';
        this.POSTAL_CODE = data.POSTAL_CODE ?? '';
        this.REGION = data.REGION ?? '';
        this.PROVINCE = data.PROVINCE ?? '';
        this.COUNTRY = data.COUNTRY ?? '';
        this.TYPE_ID =
            data.TYPE_ID != null
                ? (Number(data.TYPE_ID) as TypeIdAddress)
                : null;
        this.TYPE = data.TYPE ?? '';
        this.ANCHOR_TYPE_ID =
            data.ANCHOR_TYPE_ID ?? (BitrixOwnerTypeId.COMPANY as number);
        this.ANCHOR_ID = data.ANCHOR_ID != null ? Number(data.ANCHOR_ID) : -1;
    }
}
