import { EBxMethod } from 'src/modules/bitrix/core';
import {
    CrmAddRequestType,
    CrmListRequestType,
    CrmUpdateRequestType,
} from '../../type/crm-request.type';
import {
    IBXTimelineComment,
    IBXTimelineLogMessage,
    IBXTimelineLogMessageResult,
} from '../interface/bx-timeline.interface';

/** crm.timeline.logmessage.* — служебные лог-записи таймлайна. */
export type TimelineLogMessageSchema = {
    [EBxMethod.ADD]: {
        request: { fields: IBXTimelineLogMessage };
        response: IBXTimelineLogMessageResult;
    };
};

export type TimelineCommentSchema = {
    [EBxMethod.ADD]: {
        request: CrmAddRequestType<IBXTimelineComment>;
        response: { result: number };
    };
    /** crm.timeline.comment.update: ответ — идентификатор комментария. */
    [EBxMethod.UPDATE]: {
        request: CrmUpdateRequestType<IBXTimelineComment>;
        response: number;
    };
    [EBxMethod.LIST]: {
        request: CrmListRequestType<IBXTimelineComment>;
        response: IBXTimelineComment[];
    };
};
