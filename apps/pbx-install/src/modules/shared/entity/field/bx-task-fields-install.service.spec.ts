import { BxTaskFieldsInstallService } from './bx-task-fields-install.service';
import { Field } from '../../parse-field-excel/type/parse-field.type';

const TASK_FIELD: Field = {
    name: 'Комментарий события',
    appType: 'task',
    type: 'string',
    list: [],
    code: 'event_comment',
    bxFieldName: 'EVENT_COMMENT',
    order: 100,
    isNeedUpdate: true,
    isMultiple: false,
};

describe('BxTaskFieldsInstallService', () => {
    let getList: jest.Mock;
    let addBtch: jest.Mock;
    let updateBtch: jest.Mock;
    let callBatch: jest.Mock;
    let pbxService: { init: jest.Mock };

    const buildBitrix = () => ({
        taskUserField: { getList },
        batch: { taskUserField: { addBtch, updateBtch, deleteBtch: jest.fn() } },
        api: { callBatchWithConcurrency: callBatch },
    });

    beforeEach(() => {
        getList = jest.fn();
        addBtch = jest.fn();
        updateBtch = jest.fn();
        callBatch = jest.fn();
        pbxService = {
            init: jest
                .fn()
                .mockImplementation(() =>
                    Promise.resolve({ bitrix: buildBitrix() }),
                ),
        };
    });

    it('создаёт поле UF_TASK_EVENT_COMMENT, если его нет', async () => {
        getList
            .mockResolvedValueOnce({ result: [] })
            .mockResolvedValueOnce({
                result: [
                    { FIELD_NAME: 'UF_TASK_EVENT_COMMENT', ID: '1325' },
                ],
            });
        callBatch.mockResolvedValue([{ result: { event_comment: 1325 } }]);

        const service = new BxTaskFieldsInstallService(
            'test.bitrix24.ru',
            pbxService as never,
            [TASK_FIELD],
        );
        const res = await service.installBxFields();

        expect(addBtch).toHaveBeenCalledTimes(1);
        const [code, params] = addBtch.mock.calls[0];
        expect(code).toBe('event_comment');
        expect(params.FIELD_NAME).toBe('UF_TASK_EVENT_COMMENT');
        expect(params.USER_TYPE_ID).toBe('string');
        expect(updateBtch).not.toHaveBeenCalled();
        expect(res.countSuccess).toBe(1);
    });

    it('обновляет поле, если оно уже существует', async () => {
        getList.mockResolvedValue({
            result: [{ FIELD_NAME: 'UF_TASK_EVENT_COMMENT', ID: '1325' }],
        });
        callBatch.mockResolvedValue([{ result: { event_comment: true } }]);

        const service = new BxTaskFieldsInstallService(
            'test.bitrix24.ru',
            pbxService as never,
            [TASK_FIELD],
        );
        await service.installBxFields();

        expect(updateBtch).toHaveBeenCalledTimes(1);
        const [code, id] = updateBtch.mock.calls[0];
        expect(code).toBe('event_comment');
        expect(id).toBe('1325');
        expect(addBtch).not.toHaveBeenCalled();
    });
});
