import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImV2FileUploadRequest } from '../interface/bx-im-v2-file.interface';

export class BxImV2FileRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    /** im.v2.File.upload — файл в чат от имени текущего пользователя. */
    async upload(data: IBXImV2FileUploadRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IMV2,
            EBXEntity.FILE,
            EBxMethod.UPLOAD,
            data,
        );
    }
}
