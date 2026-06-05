import { BxImBotV2FileRepository } from '../repository/bx-imbot-v2-file.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotV2FileUploadRequest,
    IBXImBotV2FileDownloadRequest,
} from '../interface/bx-imbot-v2-file.interface';

export class BxImBotV2FileService {
    clone(api: BitrixBaseApi): BxImBotV2FileService {
        const instance = new BxImBotV2FileService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2FileRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2FileRepository(api);
    }

    async upload(data: IBXImBotV2FileUploadRequest) {
        return await this.repo.upload(data);
    }

    async download(data: IBXImBotV2FileDownloadRequest) {
        return await this.repo.download(data);
    }
}
