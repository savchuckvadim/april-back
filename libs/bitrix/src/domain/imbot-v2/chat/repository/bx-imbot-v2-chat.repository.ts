import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotV2ChatAddRequest,
    IBXImBotV2ChatGetRequest,
    IBXImBotV2ChatLeaveRequest,
    IBXImBotV2ChatSetOwnerRequest,
    IBXImBotV2ChatUpdateRequest,
    IBXImBotV2ChatUsersRequest,
    IBXImBotV2ChatUserListRequest,
    IBXImBotV2ChatInputActionNotifyRequest,
    IBXImBotV2ChatTextFieldEnabledRequest,
} from '../interface/bx-imbot-v2-chat.interface';

const NS = EBxNamespace.IMBOT_V2;
const ENTITY = EBXEntity.CHAT_V2;

export class BxImBotV2ChatRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async add(data: IBXImBotV2ChatAddRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.ADD, data);
    }

    async get(data: IBXImBotV2ChatGetRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.GET, data);
    }

    async leave(data: IBXImBotV2ChatLeaveRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.LEAVE, data);
    }

    async setOwner(data: IBXImBotV2ChatSetOwnerRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.SET_OWNER, data);
    }

    async update(data: IBXImBotV2ChatUpdateRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.UPDATE, data);
    }

    async managerAdd(data: IBXImBotV2ChatUsersRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.MANAGER_ADD,
            data,
        );
    }

    async managerDelete(data: IBXImBotV2ChatUsersRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.MANAGER_DELETE,
            data,
        );
    }

    async userAdd(data: IBXImBotV2ChatUsersRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.USER_ADD, data);
    }

    async userDelete(data: IBXImBotV2ChatUsersRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.USER_DELETE,
            data,
        );
    }

    async userList(data: IBXImBotV2ChatUserListRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.USER_LIST, data);
    }

    async inputActionNotify(data: IBXImBotV2ChatInputActionNotifyRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.INPUT_ACTION_NOTIFY,
            data,
        );
    }

    async textFieldEnabled(data: IBXImBotV2ChatTextFieldEnabledRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.TEXT_FIELD_ENABLED,
            data,
        );
    }

    addBtch(cmdCode: string, data: IBXImBotV2ChatAddRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.ADD,
            data,
        );
    }

    userAddBtch(cmdCode: string, data: IBXImBotV2ChatUsersRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.USER_ADD,
            data,
        );
    }
}
