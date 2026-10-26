import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { BxImOpenlinesOperatorSessionRepository } from '../repository/bx-imopenlines-operator-session.repository';

describe('BxImOpenlinesOperatorSessionRepository', () => {
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let repo: BxImOpenlinesOperatorSessionRepository;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({ result: true });
        addCmdBatchType = jest.fn();
        const api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
        repo = new BxImOpenlinesOperatorSessionRepository(api);
    });

    it('join → imopenlines + session + join', async () => {
        await repo.join({ CHAT_ID: 769 });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMOPENLINES,
            EBXEntity.SESSION,
            EBxMethod.JOIN,
            { CHAT_ID: 769 },
        );
    });

    it('joinBtch добавляет batch-команду', () => {
        repo.joinBtch('join_769', { CHAT_ID: 769 });
        expect(addCmdBatchType).toHaveBeenCalledWith(
            'join_769',
            EBxNamespace.IMOPENLINES,
            EBXEntity.SESSION,
            EBxMethod.JOIN,
            { CHAT_ID: 769 },
        );
    });
});
