import { EBxMethod } from 'src/modules/bitrix/core';
import { IBxRpaType } from '../interface/bx-rpa-type.interface';

export type BxRpaTypeSchema = {
    [EBxMethod.ADD]: {
        request: { fields: Partial<IBxRpaType> };
        response: { type: IBxRpaType };
    };
    [EBxMethod.GET]: {
        request: { id: number | string };
        response: { type: IBxRpaType };
    };
    [EBxMethod.LIST]: {
        request: Record<string, never>;
        response: { types: IBxRpaType[] };
    };
    [EBxMethod.UPDATE]: {
        request: { id: number | string; fields: Partial<IBxRpaType> };
        response: { type: IBxRpaType };
    };
    [EBxMethod.DELETE]: {
        request: { id: number | string };
        response: boolean;
    };
};
