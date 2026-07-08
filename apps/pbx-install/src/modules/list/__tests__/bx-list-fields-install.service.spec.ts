import { BxListFieldsInstallService } from '../services/install/bx-list-fields-install.service';
import { PBXService } from '@/modules/pbx';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';

/**
 * Тесты установки полей списка: сопоставление по CODE, выбор add/update,
 * сборка LIST-payload enum-поля (существующие сохраняют id, новые — n0…,
 * кастомные значения клиента не удаляются), маппинг типов и multiple.
 */
describe('BxListFieldsInstallService', () => {
    let getListFields: jest.Mock;
    let addField: jest.Mock;
    let updateField: jest.Mock;
    let callBatchWithConcurrency: jest.Mock;
    let pbxService: PBXService;

    const enumField: Field = {
        name: 'Тип События',
        appType: 'calling',
        type: 'enumeration',
        list: [
            {
                VALUE: 'Звонок',
                DEL: 'N',
                XML_ID: 'call',
                CODE: 'call',
                SORT: 10,
            },
            { VALUE: 'Инфо', DEL: 'N', XML_ID: 'info', CODE: 'info', SORT: 20 },
        ],
        code: 'event_type',
        bxFieldName: 'EVENT_TYPE',
        order: 40,
        isNeedUpdate: true,
        isMultiple: false,
    };

    const multipleField: Field = {
        name: 'Контакты',
        appType: 'presentation',
        type: 'multiple',
        list: [],
        code: 'pres_plan_contacts',
        bxFieldName: 'PRES_PLAN_CONTACTS',
        order: 100,
        isNeedUpdate: true,
        isMultiple: true,
    };

    beforeEach(() => {
        getListFields = jest.fn();
        addField = jest.fn();
        updateField = jest.fn();
        callBatchWithConcurrency = jest.fn().mockResolvedValue([]);
        pbxService = {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    list: { getListFields },
                    batch: { list: { addField, updateField } },
                    api: { callBatchWithConcurrency },
                },
            }),
        } as unknown as PBXService;
    });

    function service(fields: Field[]): BxListFieldsInstallService {
        return new BxListFieldsInstallService(
            'test.bitrix24.ru',
            pbxService,
            { IBLOCK_ID: 41 },
            { type: 'kpi', group: 'sales' },
            fields,
        );
    }

    it('новое поле → addField с полным легаси-CODE и ключом batch = code', async () => {
        getListFields.mockResolvedValue({ result: {} });

        await service([multipleField]).installFields();

        expect(addField).toHaveBeenCalledWith(
            'pres_plan_contacts',
            { IBLOCK_ID: 41 },
            expect.objectContaining({
                NAME: 'Контакты',
                CODE: 'sales_kpi_pres_plan_contacts',
                TYPE: 'S',
                MULTIPLE: 'Y',
                SORT: 100,
            }),
        );
        expect(updateField).not.toHaveBeenCalled();
    });

    it('легаси-поле с полным CODE (sales_kpi_event_type) матчится и обновляется', async () => {
        getListFields.mockResolvedValue({
            result: {
                PROPERTY_55: {
                    ID: '55',
                    NAME: 'Старое имя',
                    CODE: 'sales_kpi_event_type',
                    TYPE: 'L',
                    MULTIPLE: 'N',
                    DISPLAY_VALUES_FORM: { '457': 'Звонок' },
                },
            },
        });

        await service([enumField]).installFields();

        expect(addField).not.toHaveBeenCalled();
        expect(updateField).toHaveBeenCalledWith(
            'event_type',
            { IBLOCK_ID: 41 },
            'PROPERTY_55',
            expect.objectContaining({
                NAME: 'Тип События',
                CODE: 'sales_kpi_event_type',
            }),
        );
    });

    it('поле с ошибочным CODE=EVENT_TYPE матчится по btx-кандидату и мигрирует на полный CODE', async () => {
        getListFields.mockResolvedValue({
            result: {
                PROPERTY_101: {
                    ID: '101',
                    NAME: 'Старое имя',
                    CODE: 'EVENT_TYPE',
                    TYPE: 'L',
                    DISPLAY_VALUES_FORM: { '457': 'Звонок' },
                },
            },
        });

        await service([enumField]).installFields();

        expect(addField).not.toHaveBeenCalled();
        expect(updateField).toHaveBeenCalledWith(
            'event_type',
            { IBLOCK_ID: 41 },
            'PROPERTY_101',
            expect.objectContaining({
                NAME: 'Тип События',
                TYPE: 'L',
                CODE: 'sales_kpi_event_type',
            }),
        );
    });

    it('при update сохраняются TYPE/MULTIPLE/IS_REQUIRED существующего поля', async () => {
        getListFields.mockResolvedValue({
            result: {
                PROPERTY_60: {
                    ID: '60',
                    NAME: 'Контакты',
                    CODE: 'sales_kpi_pres_plan_contacts',
                    TYPE: 'S',
                    MULTIPLE: 'N',
                    IS_REQUIRED: 'Y',
                },
            },
        });

        await service([multipleField]).installFields();

        expect(updateField).toHaveBeenCalledWith(
            'pres_plan_contacts',
            { IBLOCK_ID: 41 },
            'PROPERTY_60',
            expect.objectContaining({
                MULTIPLE: 'N',
                IS_REQUIRED: 'Y',
                TYPE: 'S',
            }),
        );
    });

    it('LIST enum-поля: существующее значение сохраняет id, новое получает n0', async () => {
        getListFields.mockResolvedValue({
            result: {
                PROPERTY_101: {
                    ID: '101',
                    NAME: 'Тип События',
                    CODE: 'EVENT_TYPE',
                    TYPE: 'L',
                    DISPLAY_VALUES_FORM: {
                        '457': 'Звонок',
                        '458': 'Кастомное значение клиента',
                    },
                },
            },
        });

        await service([enumField]).installFields();

        const call = updateField.mock.calls[0] as unknown[];
        const payload = call[3] as {
            LIST: Record<string, { VALUE: string }>;
        };
        expect(payload.LIST['457']).toEqual({
            VALUE: 'Звонок',
            SORT: 10,
            DEF: 'N',
        });
        expect(payload.LIST['n0']).toEqual({
            VALUE: 'Инфо',
            SORT: 20,
            DEF: 'N',
        });
        // кастомное значение клиента не удаляется
        expect(payload.LIST['458']).toEqual({
            VALUE: 'Кастомное значение клиента',
        });
    });

    it('результат: bxField подтягивается по CODE после установки, ошибки batch попадают в errorCodes', async () => {
        getListFields
            .mockResolvedValueOnce({ result: {} })
            .mockResolvedValueOnce({
                result: {
                    PROPERTY_102: {
                        ID: '102',
                        NAME: 'Тип События',
                        CODE: 'EVENT_TYPE',
                        TYPE: 'L',
                    },
                },
            });
        callBatchWithConcurrency.mockResolvedValue([
            {
                result: { event_type: 'PROPERTY_102' },
                result_error: { bad_field: 'error text' },
            },
        ]);

        const result = await service([enumField]).installFields();

        expect(result.errorCodes).toEqual(['bad_field']);
        expect(result.countTotal).toBe(1);
        expect(result.countSuccess).toBe(1);
        expect(result.results[0].bxField?.fieldId).toBe('PROPERTY_102');
        expect(result.results[0].bxField?.description.CODE).toBe('EVENT_TYPE');
    });
});
