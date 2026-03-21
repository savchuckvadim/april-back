import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXChatAddRequest,
    IBXChatGetRequest,
    IBXDialogGetRequest,
} from '../interface/bx-dialog.interface';

export class BxDialogRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    // im.chat.add - Создает чат
    async chatAdd(data: IBXChatAddRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IM,
            EBXEntity.CHAT,
            EBxMethod.ADD,
            data,
        );
    }

    chatAddBtch(cmdCode: string, data: IBXChatAddRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IM,
            EBXEntity.CHAT,
            EBxMethod.ADD,
            data,
        );
    }

    // im.chat.get - Получает идентификатор чата
    async chatGet(data: IBXChatGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IM,
            EBXEntity.CHAT,
            EBxMethod.GET,
            data,
        );
    }

    chatGetBtch(cmdCode: string, data: IBXChatGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IM,
            EBXEntity.CHAT,
            EBxMethod.GET,
            data,
        );
    }

    // im.counters.get - Извлекает счетчики
    async countersGet() {
        return await this.bxApi.callType(
            EBxNamespace.IM,
            EBXEntity.DIALOG,
            EBxMethod.COUNTERS_GET,
            {},
        );
    }

    countersGetBtch(cmdCode: string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IM,
            EBXEntity.DIALOG,
            EBxMethod.COUNTERS_GET,
            {},
        );
    }

    // im.dialog.get - Получает данные чата
    async dialogGet(data: IBXDialogGetRequest) {
        return await this.bxApi.callType(
            EBxNamespace.IM,
            EBXEntity.DIALOG,
            EBxMethod.DIALOG_GET,
            data,
        );
    }

    dialogGetBtch(cmdCode: string, data: IBXDialogGetRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.IM,
            EBXEntity.DIALOG,
            EBxMethod.DIALOG_GET,
            data,
        );
    }
}
