import { EBxMethod } from 'src/modules/bitrix/core';
import {
    IBXImBotV2FileUploadRequest,
    IBXImBotV2FileUploadResponse,
    IBXImBotV2FileDownloadRequest,
    IBXImBotV2FileDownloadResponse,
} from '../interface/bx-imbot-v2-file.interface';

export type ImBotV2FileSchema = {
    [EBxMethod.UPLOAD]: {
        request: IBXImBotV2FileUploadRequest;
        response: IBXImBotV2FileUploadResponse;
    };
    [EBxMethod.DOWNLOAD]: {
        request: IBXImBotV2FileDownloadRequest;
        response: IBXImBotV2FileDownloadResponse;
    };
};
