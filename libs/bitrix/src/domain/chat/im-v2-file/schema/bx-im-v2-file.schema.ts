import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImV2FileUploadRequest,
    IBXImV2FileUploadResponse,
} from '../interface/bx-im-v2-file.interface';

export type ImV2FileSchema = {
    [EBxMethod.UPLOAD]: {
        request: IBXImV2FileUploadRequest;
        response: IBXImV2FileUploadResponse;
    };
};
