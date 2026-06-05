import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotV2FileUploadRequest,
    IBXImBotV2FileDownloadRequest,
} from '../interface/bx-imbot-v2-file.interface';

const NS = EBxNamespace.IMBOT_V2;
const ENTITY = EBXEntity.FILE;

export class BxImBotV2FileRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async upload(data: IBXImBotV2FileUploadRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.UPLOAD, data);
    }

    async download(data: IBXImBotV2FileDownloadRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.DOWNLOAD, data);
    }

    uploadBtch(cmdCode: string, data: IBXImBotV2FileUploadRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.UPLOAD,
            data,
        );
    }

    downloadBtch(cmdCode: string, data: IBXImBotV2FileDownloadRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.DOWNLOAD,
            data,
        );
    }
}
