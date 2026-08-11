import {
    BitrixBaseApi,
    EBxNamespace,
    EBXEntity,
    EBxMethod,
} from 'src/modules/bitrix/core';
import { IBXImNotifySystemAdd } from '../interface/bx-im-notify.interface';

/**
 * im.notify.system.* — системные уведомления пользователям портала
 * (колокольчик). Batch-варианта нет сознательно: уведомления шлются
 * штучно (SLA-передачи, алерты руководителю), батчить нечего.
 */
export class BxImNotifyRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async systemAdd(data: IBXImNotifySystemAdd) {
        return await this.bxApi.callType(
            EBxNamespace.IM,
            EBXEntity.NOTIFY_SYSTEM,
            EBxMethod.ADD,
            data,
        );
    }
}
