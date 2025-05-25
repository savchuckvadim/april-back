import { EBxMethod } from "src/modules/bitrix/core";
import { IBXCategory } from "../interface/bx-category.interface";
import { BitrixOwnerTypeId } from "src/modules/bitrix/domain/enums/bitrix-constants.enum";


export type BxCategorySchema = {

    [EBxMethod.LIST]: {
        request: { entityTypeId: BitrixOwnerTypeId };
        response: { categories: IBXCategory[] };
    };
    [EBxMethod.GET]: {
        request: { id: number | string, entityTypeId: BitrixOwnerTypeId };
        response: { category: IBXCategory };
    };
};
