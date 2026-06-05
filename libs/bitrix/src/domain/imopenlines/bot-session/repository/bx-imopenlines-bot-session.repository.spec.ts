import { BxImOpenlinesBotSessionRepository } from './bx-imopenlines-bot-session.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';

describe('BxImOpenlinesBotSessionRepository', () => {
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let repo: BxImOpenlinesBotSessionRepository;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({ result: true });
        addCmdBatchType = jest.fn();
        const api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
        repo = new BxImOpenlinesBotSessionRepository(api);
    });

    it('finish → imopenlines + bot.session + session.finish', async () => {
        await repo.finish({ CHAT_ID: 7 });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMOPENLINES,
            EBXEntity.BOT_SESSION,
            EBxMethod.SESSION_FINISH,
            { CHAT_ID: 7 },
        );
    });

    it('transfer → метод session.transfer', async () => {
        await repo.transfer({ CHAT_ID: 7, QUEUE_ID: 3 });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMOPENLINES,
            EBXEntity.BOT_SESSION,
            EBxMethod.SESSION_TRANSFER,
            { CHAT_ID: 7, QUEUE_ID: 3 },
        );
    });

    it('messageSendBtch добавляет batch-команду', () => {
        repo.messageSendBtch('s', { CHAT_ID: 7, MESSAGE: 'hi' });
        expect(addCmdBatchType).toHaveBeenCalledWith(
            's',
            EBxNamespace.IMOPENLINES,
            EBXEntity.BOT_SESSION,
            EBxMethod.SESSION_MESSAGE_SEND,
            { CHAT_ID: 7, MESSAGE: 'hi' },
        );
    });
});
