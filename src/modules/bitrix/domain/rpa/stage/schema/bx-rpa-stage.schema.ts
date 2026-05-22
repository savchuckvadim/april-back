import { EBxMethod } from 'src/modules/bitrix/core';
import { IBxRpaStage } from '../interface/bx-rpa-stage.interface';

export type BxRpaStageSchema = {
    [EBxMethod.STAGE_ADD]: {
        request: { fields: Partial<IBxRpaStage> };
        response: { stage: IBxRpaStage };
    };
    [EBxMethod.STAGE_UPDATE]: {
        request: { id: number | string; fields: Partial<IBxRpaStage> };
        response: { stage: IBxRpaStage };
    };
    [EBxMethod.STAGE_LIST_FOR_TYPE]: {
        request: { typeId: number | string };
        response: { stages: IBxRpaStage[] };
    };
};
