import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { BxImV2ChatMessageRepository } from '../repository/bx-im-v2-chat-message.repository';

describe('BxImV2ChatMessageRepository', () => {
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let repo: BxImV2ChatMessageRepository;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({ result: { messages: [] } });
        addCmdBatchType = jest.fn();
        const api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
        repo = new BxImV2ChatMessageRepository(api);
    });

    it('tail → im.v2 + Chat.Message + tail', async () => {
        await repo.tail({ dialogId: 'chat769', limit: 30 });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMV2,
            EBXEntity.CHAT_MESSAGE_V2,
            EBxMethod.TAIL,
            { dialogId: 'chat769', limit: 30 },
        );
    });

    it('tailBtch добавляет batch-команду под своим ключом', () => {
        repo.tailBtch('tail_769', { dialogId: 'chat769', limit: 30 });
        expect(addCmdBatchType).toHaveBeenCalledWith(
            'tail_769',
            EBxNamespace.IMV2,
            EBXEntity.CHAT_MESSAGE_V2,
            EBxMethod.TAIL,
            { dialogId: 'chat769', limit: 30 },
        );
    });
});
