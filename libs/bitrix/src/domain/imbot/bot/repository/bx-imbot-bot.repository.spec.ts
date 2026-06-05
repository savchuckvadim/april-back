import { BxImBotRepository } from './bx-imbot-bot.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImBotRegisterRequest } from '../interface/bx-imbot-bot.interface';

describe('BxImBotRepository', () => {
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let repo: BxImBotRepository;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({ result: 1 });
        addCmdBatchType = jest.fn();
        const api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
        repo = new BxImBotRepository(api);
    });

    const registerPayload: IBXImBotRegisterRequest = {
        CODE: 'april_bot',
        EVENT_MESSAGE_ADD: 'https://x/y',
        EVENT_WELCOME_MESSAGE: 'https://x/y',
        EVENT_BOT_DELETE: 'https://x/y',
        PROPERTIES: { NAME: 'Apri' },
    };

    it('register → imbot + BOT_LIFECYCLE + REGISTER', async () => {
        await repo.register(registerPayload);
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMBOT,
            EBXEntity.BOT_LIFECYCLE,
            EBxMethod.REGISTER,
            registerPayload,
        );
    });

    it('list → imbot + BOT + LIST', async () => {
        await repo.list();
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMBOT,
            EBXEntity.BOT,
            EBxMethod.LIST,
            {},
        );
    });

    it('registerBtch добавляет batch-команду', () => {
        repo.registerBtch('reg', registerPayload);
        expect(addCmdBatchType).toHaveBeenCalledWith(
            'reg',
            EBxNamespace.IMBOT,
            EBXEntity.BOT_LIFECYCLE,
            EBxMethod.REGISTER,
            registerPayload,
        );
    });
});
