import { BxUserFieldsInstallService } from './bx-user-fields-install.service';
import { Field } from '../../parse-field-excel/type/parse-field.type';

const STRING_FIELD: Field = {
    name: 'Комментарий события',
    appType: 'user',
    type: 'string',
    list: [],
    code: 'event_comment',
    bxFieldName: 'EVENT_COMMENT',
    order: 100,
    isNeedUpdate: true,
    isMultiple: false,
};

const ENUM_FIELD: Field = {
    name: 'Статус',
    appType: 'user',
    type: 'enumeration',
    list: [
        { VALUE: 'Новый', DEL: 'N', XML_ID: 'st_new', CODE: 'st_new', SORT: 10 },
    ],
    code: 'status',
    bxFieldName: 'STATUS',
    order: 110,
    isNeedUpdate: true,
    isMultiple: false,
};

describe('BxUserFieldsInstallService', () => {
    let listFields: jest.Mock;
    let addUserField: jest.Mock;
    let updateUserField: jest.Mock;
    let callBatch: jest.Mock;
    let pbxService: { init: jest.Mock };

    const buildBitrix = () => ({
        user: { listFields },
        batch: { user: { addUserField, updateUserField } },
        api: { callBatchWithConcurrency: callBatch },
    });

    beforeEach(() => {
        listFields = jest.fn();
        addUserField = jest.fn();
        updateUserField = jest.fn();
        callBatch = jest.fn();
        pbxService = {
            init: jest
                .fn()
                .mockImplementation(() =>
                    Promise.resolve({ bitrix: buildBitrix() }),
                ),
        };
    });

    it('создаёт поле UF_USR_EVENT_COMMENT, если его нет', async () => {
        listFields
            .mockResolvedValueOnce({ result: [] })
            .mockResolvedValueOnce({
                result: [{ FIELD_NAME: 'UF_USR_EVENT_COMMENT', ID: '50' }],
            });
        callBatch.mockResolvedValue([{ result: { event_comment: 50 } }]);

        const service = new BxUserFieldsInstallService(
            'test.bitrix24.ru',
            pbxService as never,
            [STRING_FIELD],
        );
        const res = await service.installBxFields();

        expect(addUserField).toHaveBeenCalledTimes(1);
        const [code, data] = addUserField.mock.calls[0];
        expect(code).toBe('event_comment');
        expect(data.FIELD_NAME).toBe('UF_USR_EVENT_COMMENT');
        expect(updateUserField).not.toHaveBeenCalled();
        expect(res.countSuccess).toBe(1);
    });

    it('обновляет существующее поле и прокидывает LIST для enumeration', async () => {
        listFields.mockResolvedValue({
            result: [{ FIELD_NAME: 'UF_USR_STATUS', ID: '77', LIST: [] }],
        });
        callBatch.mockResolvedValue([{ result: { status: true } }]);

        const service = new BxUserFieldsInstallService(
            'test.bitrix24.ru',
            pbxService as never,
            [ENUM_FIELD],
        );
        await service.installBxFields();

        expect(updateUserField).toHaveBeenCalledTimes(1);
        const [code, id, data] = updateUserField.mock.calls[0];
        expect(code).toBe('status');
        expect(id).toBe('77');
        expect(Array.isArray(data.LIST)).toBe(true);
        expect(data.LIST[0].VALUE).toBe('Новый');
        expect(addUserField).not.toHaveBeenCalled();
    });
});
