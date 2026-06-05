import { BxImBotV2ChatRepository } from '../repository/bx-imbot-v2-chat.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
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

export class BxImBotV2ChatService {
    clone(api: BitrixBaseApi): BxImBotV2ChatService {
        const instance = new BxImBotV2ChatService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotV2ChatRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotV2ChatRepository(api);
    }

    async add(data: IBXImBotV2ChatAddRequest) {
        return await this.repo.add(data);
    }

    async get(data: IBXImBotV2ChatGetRequest) {
        return await this.repo.get(data);
    }

    async leave(data: IBXImBotV2ChatLeaveRequest) {
        return await this.repo.leave(data);
    }

    async setOwner(data: IBXImBotV2ChatSetOwnerRequest) {
        return await this.repo.setOwner(data);
    }

    async update(data: IBXImBotV2ChatUpdateRequest) {
        return await this.repo.update(data);
    }

    async managerAdd(data: IBXImBotV2ChatUsersRequest) {
        return await this.repo.managerAdd(data);
    }

    async managerDelete(data: IBXImBotV2ChatUsersRequest) {
        return await this.repo.managerDelete(data);
    }

    async userAdd(data: IBXImBotV2ChatUsersRequest) {
        return await this.repo.userAdd(data);
    }

    async userDelete(data: IBXImBotV2ChatUsersRequest) {
        return await this.repo.userDelete(data);
    }

    async userList(data: IBXImBotV2ChatUserListRequest) {
        return await this.repo.userList(data);
    }

    async inputActionNotify(data: IBXImBotV2ChatInputActionNotifyRequest) {
        return await this.repo.inputActionNotify(data);
    }

    async textFieldEnabled(data: IBXImBotV2ChatTextFieldEnabledRequest) {
        return await this.repo.textFieldEnabled(data);
    }
}
