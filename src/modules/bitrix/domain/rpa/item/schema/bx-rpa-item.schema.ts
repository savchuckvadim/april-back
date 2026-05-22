import { EBxMethod } from 'src/modules/bitrix/core';
import { IBxRpaItem } from '../interface/bx-rpa-item.interface';
import {
    AddRpaItemDto,
    GetRpaItemDto,
    ListRpaItemDto,
    UpdateRpaItemDto,
} from '../dto/rpa-item.dto';

export type BxRpaItemSchema = {
    [EBxMethod.GET]: {
        request: GetRpaItemDto;
        response: { item: IBxRpaItem };
    };

    [EBxMethod.ADD]: {
        request: AddRpaItemDto;
        response: { item: IBxRpaItem };
    };

    [EBxMethod.UPDATE]: {
        request: UpdateRpaItemDto;
        response: { item: IBxRpaItem };
    };

    [EBxMethod.LIST]: {
        request: ListRpaItemDto;
        response: { items: IBxRpaItem[] };
    };
};
