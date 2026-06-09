import { BxSonetGroupRepository } from './sonet-group.repository';
import {
    EBxMethod,
    EBxNamespace,
} from 'src/modules/bitrix/core/domain/consts/bitrix-api.enum';
import { EBXEntity } from 'src/modules/bitrix/core/domain/consts/bitrix-entities.enum';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';

describe('BxSonetGroupRepository', () => {
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;
    let repo: BxSonetGroupRepository;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({ result: 1 });
        addCmdBatchType = jest.fn();
        const api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
        repo = new BxSonetGroupRepository(api);
    });

    it('add: вызывает sonet_group + пустая entity + add c полями', async () => {
        await repo.add({ NAME: 'ОП Звонки' });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.ADD,
            { NAME: 'ОП Звонки' },
        );
    });

    it('update: прокидывает GROUP_ID вместе с полями', async () => {
        await repo.update(42, { NAME: 'ОС Звонки' });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.UPDATE,
            { GROUP_ID: 42, NAME: 'ОС Звонки' },
        );
    });

    it('get: оборачивает фильтр и сортировку', async () => {
        await repo.get({ NAME: 'ОП Звонки' });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.GET,
            { FILTER: { NAME: 'ОП Звонки' }, ORDER: undefined },
        );
    });

    it('delete: передаёт GROUP_ID', async () => {
        await repo.delete(42);
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.DELETE,
            { GROUP_ID: 42 },
        );
    });

    it('addBtch: накапливает batch-команду', () => {
        repo.addBtch('cmd1', { NAME: 'ОП Звонки' });
        expect(addCmdBatchType).toHaveBeenCalledWith(
            'cmd1',
            EBxNamespace.SONET_GROUP,
            EBXEntity.SONET_GROUP,
            EBxMethod.ADD,
            { NAME: 'ОП Звонки' },
        );
    });
});
