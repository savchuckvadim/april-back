import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { BxImV2FileRepository } from '../repository/bx-im-v2-file.repository';
import { IBXImV2FileUploadRequest } from '../interface/bx-im-v2-file.interface';

/**
 * Файлы в чат (im.v2.File.*). Загрузка на Диск, прикрепление к чату и
 * отправка сообщения выполняются одним вызовом — в отличие от связки
 * disk.*.uploadfile + im.disk.file.commit (последний устарел).
 */
export class BxImV2FileService {
    private repo: BxImV2FileRepository;

    clone(api: BitrixBaseApi): BxImV2FileService {
        const instance = new BxImV2FileService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxImV2FileRepository(api);
    }

    async upload(data: IBXImV2FileUploadRequest) {
        return await this.repo.upload(data);
    }
}
