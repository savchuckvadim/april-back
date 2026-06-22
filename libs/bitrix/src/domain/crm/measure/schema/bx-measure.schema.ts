import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBxMeasure,
    IBxMeasureGetResponse,
    IBxMeasureListResponse,
} from '../interface/bx-measure.interface';

export type BxMeasureSchema = {
    [EBxMethod.LIST]: {
        request: Record<string, never>;
        response: IBxMeasureListResponse;
    };
    [EBxMethod.GET]: {
        request: { id: number | string };
        response: IBxMeasureGetResponse;
    };
    [EBxMethod.ADD]: {
        request: { fields: Partial<IBxMeasure> };
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: { id: number | string; fields: Partial<IBxMeasure> };
        response: boolean;
    };
    [EBxMethod.DELETE]: {
        request: { id: number | string };
        response: boolean;
    };
};
