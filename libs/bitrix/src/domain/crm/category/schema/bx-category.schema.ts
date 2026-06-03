import { EBxMethod } from 'src/modules/bitrix/core';
import { IBXCategory } from '../interface/bx-category.interface';
import { BitrixOwnerTypeId } from 'src/modules/bitrix/domain/enums/bitrix-constants.enum';

export type BxCategorySchema = {
    [EBxMethod.LIST]: {
        request: { entityTypeId: BitrixOwnerTypeId | string };
        response: { categories: IBXCategory[] };
    };
    [EBxMethod.GET]: {
        request: {
            id: number | string;
            entityTypeId: BitrixOwnerTypeId | string;
        };
        response: { category: IBXCategory };
    };
    [EBxMethod.ADD]: {
        request: {
            entityTypeId: BitrixOwnerTypeId | string;
            fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>;
        };
        response: { category: IBXCategory };
    };
    [EBxMethod.UPDATE]: {
        request: {
            id: number | string;
            entityTypeId: BitrixOwnerTypeId | string;
            fields: Partial<Omit<IBXCategory, 'id' | 'entityTypeId'>>;
        };
        response: { category: IBXCategory };
    };
    [EBxMethod.DELETE]: {
        request: {
            id: number | string;
            entityTypeId: BitrixOwnerTypeId | string;
        };
        response: boolean;
    };
};
