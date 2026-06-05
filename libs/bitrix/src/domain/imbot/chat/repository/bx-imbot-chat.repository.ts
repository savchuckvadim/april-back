import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import {
    IBXImBotChatAddRequest,
    IBXImBotChatGetRequest,
    IBXImBotChatLeaveRequest,
    IBXImBotChatSendTypingRequest,
    IBXImBotChatSetOwnerRequest,
    IBXImBotChatSetManagerRequest,
    IBXImBotChatUpdateTitleRequest,
    IBXImBotChatUpdateColorRequest,
    IBXImBotChatUpdateAvatarRequest,
    IBXImBotChatUserAddRequest,
    IBXImBotChatUserDeleteRequest,
    IBXImBotChatUserListRequest,
} from '../interface/bx-imbot-chat.interface';

const NS = EBxNamespace.IMBOT;
const ENTITY = EBXEntity.CHAT;

export class BxImBotChatRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async add(data: IBXImBotChatAddRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.ADD, data);
    }

    async get(data: IBXImBotChatGetRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.GET, data);
    }

    async leave(data: IBXImBotChatLeaveRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.LEAVE, data);
    }

    async sendTyping(data: IBXImBotChatSendTypingRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.SEND_TYPING,
            data,
        );
    }

    async setOwner(data: IBXImBotChatSetOwnerRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.SET_OWNER, data);
    }

    async setManager(data: IBXImBotChatSetManagerRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.SET_MANAGER,
            data,
        );
    }

    async updateTitle(data: IBXImBotChatUpdateTitleRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.UPDATE_TITLE,
            data,
        );
    }

    async updateColor(data: IBXImBotChatUpdateColorRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.UPDATE_COLOR,
            data,
        );
    }

    async updateAvatar(data: IBXImBotChatUpdateAvatarRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.UPDATE_AVATAR,
            data,
        );
    }

    async userAdd(data: IBXImBotChatUserAddRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.USER_ADD, data);
    }

    async userDelete(data: IBXImBotChatUserDeleteRequest) {
        return await this.bxApi.callType(
            NS,
            ENTITY,
            EBxMethod.USER_DELETE,
            data,
        );
    }

    async userList(data: IBXImBotChatUserListRequest) {
        return await this.bxApi.callType(NS, ENTITY, EBxMethod.USER_LIST, data);
    }

    addBtch(cmdCode: string, data: IBXImBotChatAddRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.ADD,
            data,
        );
    }

    sendTypingBtch(cmdCode: string, data: IBXImBotChatSendTypingRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.SEND_TYPING,
            data,
        );
    }

    userAddBtch(cmdCode: string, data: IBXImBotChatUserAddRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.USER_ADD,
            data,
        );
    }

    userDeleteBtch(cmdCode: string, data: IBXImBotChatUserDeleteRequest) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            NS,
            ENTITY,
            EBxMethod.USER_DELETE,
            data,
        );
    }
}
