import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { BxImOpenlinesV2SessionRepository } from '../repository/bx-imopenlines-v2-session.repository';
import { BxImOpenlinesV2SessionService } from '../services/bx-imopenlines-v2-session.service';

describe('BxImOpenlinesV2SessionRepository', () => {
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let api: BitrixBaseApi;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({
            result: { sessions: [], hasNextPage: false },
        });
        addCmdBatchType = jest.fn();
        api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
    });

    it('list → imopenlines.v2 + Session + list', async () => {
        const repo = new BxImOpenlinesV2SessionRepository(api);
        await repo.list({ configId: 9, status: 'new' });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.IMOPENLINES_V2,
            EBXEntity.SESSION_V2,
            EBxMethod.LIST,
            { configId: 9, status: 'new' },
        );
    });

    it('listBtch добавляет batch-команду', () => {
        const repo = new BxImOpenlinesV2SessionRepository(api);
        repo.listBtch('s', { configId: 9 });
        expect(addCmdBatchType).toHaveBeenCalledWith(
            's',
            EBxNamespace.IMOPENLINES_V2,
            EBXEntity.SESSION_V2,
            EBxMethod.LIST,
            { configId: 9 },
        );
    });

    it('listAll обходит страницы по hasNextPage и останавливается', async () => {
        callType
            .mockResolvedValueOnce({
                result: { sessions: [{ id: 1 }], hasNextPage: true },
            })
            .mockResolvedValueOnce({
                result: { sessions: [{ id: 2 }], hasNextPage: false },
            });
        const service = new BxImOpenlinesV2SessionService().clone(api);
        const sessions = await service.listAll({ configId: 9 });
        expect(sessions.map(s => s.id)).toEqual([1, 2]);
        expect(callType).toHaveBeenCalledTimes(2);
        expect((callType.mock.calls[1] as unknown[])[3]).toEqual(
            expect.objectContaining({ offset: 200, limit: 200 }),
        );
    });

    it('listAll не зацикливается, если портал всегда отдаёт hasNextPage', async () => {
        callType.mockResolvedValue({
            result: { sessions: [{ id: 1 }], hasNextPage: true },
        });
        const service = new BxImOpenlinesV2SessionService().clone(api);
        const sessions = await service.listAll({ configId: 9 }, 3);
        expect(sessions).toHaveLength(3);
        expect(callType).toHaveBeenCalledTimes(3);
    });
});
