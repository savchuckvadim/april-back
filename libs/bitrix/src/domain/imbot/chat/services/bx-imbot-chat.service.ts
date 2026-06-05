import { BxImBotChatRepository } from '../repository/bx-imbot-chat.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
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

export class BxImBotChatService {
    clone(api: BitrixBaseApi): BxImBotChatService {
        const instance = new BxImBotChatService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotChatRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotChatRepository(api);
    }

    async add(data: IBXImBotChatAddRequest) {
        return await this.repo.add(data);
    }

    async get(data: IBXImBotChatGetRequest) {
        return await this.repo.get(data);
    }

    async leave(data: IBXImBotChatLeaveRequest) {
        return await this.repo.leave(data);
    }

    async sendTyping(data: IBXImBotChatSendTypingRequest) {
        return await this.repo.sendTyping(data);
    }

    async setOwner(data: IBXImBotChatSetOwnerRequest) {
        return await this.repo.setOwner(data);
    }

    async setManager(data: IBXImBotChatSetManagerRequest) {
        return await this.repo.setManager(data);
    }

    async updateTitle(data: IBXImBotChatUpdateTitleRequest) {
        return await this.repo.updateTitle(data);
    }

    async updateColor(data: IBXImBotChatUpdateColorRequest) {
        return await this.repo.updateColor(data);
    }

    async updateAvatar(data: IBXImBotChatUpdateAvatarRequest) {
        return await this.repo.updateAvatar(data);
    }

    async userAdd(data: IBXImBotChatUserAddRequest) {
        return await this.repo.userAdd(data);
    }

    async userDelete(data: IBXImBotChatUserDeleteRequest) {
        return await this.repo.userDelete(data);
    }

    async userList(data: IBXImBotChatUserListRequest) {
        return await this.repo.userList(data);
    }
}
