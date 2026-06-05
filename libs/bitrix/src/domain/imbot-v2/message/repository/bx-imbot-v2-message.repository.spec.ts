import { BxImBotV2MessageRepository } from './bx-imbot-v2-message.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXImBotV2MessageSendRequest } from '../interface/bx-imbot-v2-message.interface';

describe('BxImBotV2MessageRepository', () => {
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let repo: BxImBotV2MessageRepository;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({ result: { messageId: 5 } });
        addCmdBatchType = jest.fn();
        const api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
        repo = new BxImBotV2MessageRepository(api);
    });

    const sendPayload: IBXImBotV2MessageSendRequest = {
        botId: 1,
        dialogId: 'chat10',
        fields: { message: 'hi' },
    };

    it('send → imbot.v2 + Chat.Message + SEND', async () => {
        await repo.send(sendPayload);
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMBOT_V2,
            EBXEntity.CHAT_MESSAGE_V2,
            EBxMethod.SEND,
            sendPayload,
        );
    });

    it('reactionAdd → метод Reaction.add', async () => {
        await repo.reactionAdd({ botId: 1, messageId: 9, reaction: 'like' });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMBOT_V2,
            EBXEntity.CHAT_MESSAGE_V2,
            EBxMethod.REACTION_ADD,
            { botId: 1, messageId: 9, reaction: 'like' },
        );
    });

    it('sendBtch добавляет batch-команду', () => {
        repo.sendBtch('m1', sendPayload);
        expect(addCmdBatchType).toHaveBeenCalledWith(
            'm1',
            EBxNamespace.IMBOT_V2,
            EBXEntity.CHAT_MESSAGE_V2,
            EBxMethod.SEND,
            sendPayload,
        );
    });
});
