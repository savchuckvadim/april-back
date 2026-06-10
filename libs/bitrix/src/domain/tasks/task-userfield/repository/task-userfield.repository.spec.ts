import { BxTaskUserFieldRepository } from './task-userfield.repository';
import { ETaskUserFieldType } from '../interface/task-userfield.interface';

describe('BxTaskUserFieldRepository', () => {
    let call: jest.Mock;
    let addCmdBatch: jest.Mock;
    let repo: BxTaskUserFieldRepository;

    beforeEach(() => {
        call = jest.fn().mockResolvedValue({ result: [] });
        addCmdBatch = jest.fn();
        repo = new BxTaskUserFieldRepository({
            call,
            addCmdBatch,
        } as never);
    });

    it('getList вызывает task.item.userfield.getlist с ORDER/FILTER', async () => {
        await repo.getList({ SORT: 'ASC' }, { USER_TYPE_ID: 'string' });
        expect(call).toHaveBeenCalledWith('task.item.userfield.getlist', {
            ORDER: { SORT: 'ASC' },
            FILTER: { USER_TYPE_ID: 'string' },
        });
    });

    it('add оборачивает поля в PARAMS', async () => {
        const params = {
            USER_TYPE_ID: ETaskUserFieldType.STRING,
            FIELD_NAME: 'UF_TASK_EVENT_COMMENT',
        };
        await repo.add(params);
        expect(call).toHaveBeenCalledWith('task.item.userfield.add', {
            PARAMS: params,
        });
    });

    it('update передаёт ID и PARAMS', async () => {
        const params = {
            USER_TYPE_ID: ETaskUserFieldType.STRING,
            FIELD_NAME: 'UF_TASK_EVENT_COMMENT',
        };
        await repo.update(10, params);
        expect(call).toHaveBeenCalledWith('task.item.userfield.update', {
            ID: 10,
            PARAMS: params,
        });
    });

    it('delete передаёт ID', async () => {
        await repo.delete(10);
        expect(call).toHaveBeenCalledWith('task.item.userfield.delete', {
            ID: 10,
        });
    });

    it('batch-методы используют addCmdBatch с явными именами методов', () => {
        const params = {
            USER_TYPE_ID: ETaskUserFieldType.STRING,
            FIELD_NAME: 'UF_TASK_EVENT_COMMENT',
        };
        repo.addBtch('c1', params);
        repo.updateBtch('c2', 10, params);
        repo.deleteBtch('c3', 10);
        expect(addCmdBatch).toHaveBeenNthCalledWith(
            1,
            'c1',
            'task.item.userfield.add',
            { PARAMS: params },
        );
        expect(addCmdBatch).toHaveBeenNthCalledWith(
            2,
            'c2',
            'task.item.userfield.update',
            { ID: 10, PARAMS: params },
        );
        expect(addCmdBatch).toHaveBeenNthCalledWith(
            3,
            'c3',
            'task.item.userfield.delete',
            { ID: 10 },
        );
    });
});
