import {
    BitrixBaseApi,
    EBxNamespace,
    EBXEntity,
    EBxMethod,
} from 'src/modules/bitrix/core';
import { IBXMergeBatchParams } from '../interface/bx-crm-entity.interface';

/**
 * crm.entity.* — операции над CRM-сущностью «вообще».
 *
 * Здесь НАМЕРЕННО нет batch-варианта mergeBatch: метод разрушающий
 * (сущности-жертвы удаляются) и медленный (~2 с на вызов) — в HTTP-batch
 * из 50 команд он упирается в OPERATION_TIME_LIMIT, а частичный отказ
 * внутри батча невозможно корректно разобрать (какие сущности уже удалены?).
 * Объединения выполняются только последовательными одиночными вызовами.
 */
export class BxCrmEntityRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async mergeBatch(params: IBXMergeBatchParams) {
        return await this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.CRM_ENTITY,
            EBxMethod.MERGE_BATCH,
            { params },
        );
    }
}
