import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXProductRow,
    IBXProductRowRow,
} from '../interface/bx-product-row.interface';
import { ListProductRowDto } from '../dto/list-product-row.sto';

export class BxProductRowRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async set(data: IBXProductRow) {
        return await this.bxApi.callType(
            EBxNamespace.CRM_ITEM,
            EBXEntity.PRODUCT_ROW,
            EBxMethod.SET,
            data,
        );
    }
    setBtch(cmdCode: string, data: IBXProductRow) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM_ITEM,
            EBXEntity.PRODUCT_ROW,
            EBxMethod.SET,
            data,
        );
    }
    async add(fields: IBXProductRowRow) {
        return await this.bxApi.callType(
            EBxNamespace.CRM_ITEM,
            EBXEntity.PRODUCT_ROW,
            EBxMethod.ADD,
            { fields: fields },
        );
    }
    addBtch(cmdCode: string, fields: IBXProductRowRow) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM_ITEM,
            EBXEntity.PRODUCT_ROW,
            EBxMethod.ADD,
            { fields },
        );
    }
    async list(data: ListProductRowDto) {
        return await this.bxApi.callType(
            EBxNamespace.CRM_ITEM,
            EBXEntity.PRODUCT_ROW,
            EBxMethod.LIST,
            { filter: data },
        );
    }
    listBtch(cmdCode: string, data: ListProductRowDto) {
        console.log('data', data);
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM_ITEM,
            EBXEntity.PRODUCT_ROW,
            EBxMethod.LIST,
            { filter: data },
        );
    }
}
