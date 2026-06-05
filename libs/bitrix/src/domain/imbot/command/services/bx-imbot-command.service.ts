import { BxImBotCommandRepository } from '../repository/bx-imbot-command.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    IBXImBotCommandRegisterRequest,
    IBXImBotCommandUnregisterRequest,
    IBXImBotCommandUpdateRequest,
    IBXImBotCommandAnswerRequest,
} from '../interface/bx-imbot-command.interface';

export class BxImBotCommandService {
    clone(api: BitrixBaseApi): BxImBotCommandService {
        const instance = new BxImBotCommandService();
        instance.init(api);
        return instance;
    }

    private repo: BxImBotCommandRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxImBotCommandRepository(api);
    }

    async register(data: IBXImBotCommandRegisterRequest) {
        return await this.repo.register(data);
    }

    async unregister(data: IBXImBotCommandUnregisterRequest) {
        return await this.repo.unregister(data);
    }

    async update(data: IBXImBotCommandUpdateRequest) {
        return await this.repo.update(data);
    }

    async answer(data: IBXImBotCommandAnswerRequest) {
        return await this.repo.answer(data);
    }
}
