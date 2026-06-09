import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXSonetGroup,
    IBXSonetGroupCreateFields,
    IBXSonetGroupUpdateFields,
    ISonetGroupFilter,
    ISonetGroupOrder,
} from '../interface/sonet-group.interface';

/**
 * Schema методов рабочих групп `sonet_group.*`.
 * Группа — entity-less метод (`sonet_group.create`/`update`/`get`/`delete`).
 */
export type SonetGroupSchema = {
    [EBxMethod.ADD]: {
        request: IBXSonetGroupCreateFields;
        response: number;
    };
    [EBxMethod.UPDATE]: {
        request: {
            GROUP_ID: number | string;
        } & IBXSonetGroupUpdateFields;
        response: number | boolean;
    };
    [EBxMethod.GET]: {
        request: {
            ORDER?: ISonetGroupOrder;
            FILTER?: ISonetGroupFilter;
            IS_ADMIN?: 'Y' | 'N';
        };
        response: IBXSonetGroup[];
    };
    [EBxMethod.DELETE]: {
        request: {
            GROUP_ID: number | string;
        };
        response: boolean;
    };
};
