import { Injectable } from '@nestjs/common';
import { BxImBotV2FileRepository } from '../repository/bx-imbot-v2-file.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2FileUploadRequest,
    IBXImBotV2FileDownloadRequest,
} from '../interface/bx-imbot-v2-file.interface';

@Injectable()
export class BxImBotV2FileBatchService {
    clone(api: BitrixBaseApi): BxImBotV2FileBatchService {
        const instance = new BxImBotV2FileBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2FileRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2FileRepository(api);
    }

    upload(cmdCode: string, data: IBXImBotV2FileUploadRequest) {
        return this.repo.uploadBtch(cmdCode, data);
    }

    download(cmdCode: string, data: IBXImBotV2FileDownloadRequest) {
        return this.repo.downloadBtch(cmdCode, data);
    }
}
