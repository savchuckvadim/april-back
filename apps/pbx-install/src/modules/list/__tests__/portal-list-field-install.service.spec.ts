import { PortalListFieldInstallService } from '../services/install/portal-list-field-install.service';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { IPbxListFieldInstallData } from '../services/install/portal-list-field-install.service';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';

/**
 * Тесты зеркалирования полей списка в PortalDB: entity_type=BITRIX_LIST,
 * bitrixId=числовой ID свойства (из PROPERTY_N), bitrixCamelId=FIELD_ID
 * (PROPERTY_N, без camel), items только для значений, найденных в шаблоне.
 */
describe('PortalListFieldInstallService', () => {
    let service: PortalListFieldInstallService;
    let upsertFields: jest.Mock;
    let findByEntityId: jest.Mock;
    let deleteFieldsByIds: jest.Mock;

    const parsedField: Field = {
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
        ],
        code: 'event_type',
        bxFieldName: 'EVENT_TYPE',
        order: 40,
        isNeedUpdate: true,
        isMultiple: false,
    };

    const installData: IPbxListFieldInstallData = {
        code: 'event_type',
        result: 'PROPERTY_101',
        parsedField,
        bxField: {
            fieldId: 'PROPERTY_101',
            description: {
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
    };

    beforeEach(() => {
        upsertFields = jest.fn().mockResolvedValue([]);
        findByEntityId = jest.fn().mockResolvedValue([]);
        deleteFieldsByIds = jest.fn().mockResolvedValue(undefined);
        service = new PortalListFieldInstallService(
            {
                upsertFields,
                findByEntityId,
                deleteFieldsByIds,
            } as unknown as PbxFieldService,
            // Сброс слепка портала после установки — здесь не проверяется.
            { invalidate: jest.fn() } as never,
        );
    });

    it('маппит поле в PbxFieldEntity с адресацией списка', async () => {
        await service.syncWithDb(5, { type: 'kpi', group: 'sales' }, [
            installData,
        ]);

        expect(upsertFields).toHaveBeenCalledTimes(1);
        const [entities] = upsertFields.mock.calls[0] as [
            Array<Record<string, unknown>>,
        ];
        expect(entities[0]).toMatchObject({
            entity_type: PbxEntityTypePrisma.BITRIX_LIST,
            entity_id: 5,
            // всегда 'list' (легаси-контракт Laravel), НЕ appType из шаблона
            parent_type: 'list',
            code: 'sales_kpi_event_type',
            bitrixId: '101',
            bitrixCamelId: 'PROPERTY_101',
            isPlural: false,
        });
    });

    it('items: только значения из шаблона, bitrixId = id значения в Bitrix', async () => {
        await service.syncWithDb(5, { type: 'kpi', group: 'sales' }, [
            installData,
        ]);

        const [entities] = upsertFields.mock.calls[0] as [
            Array<{ items: Array<Record<string, unknown>> }>,
        ];
        expect(entities[0].items).toEqual([
            expect.objectContaining({
                name: 'Звонок',
                code: 'call',
                bitrixId: 457,
            }),
        ]);
    });

    it('устаревшие зеркала с коротким/btx-кодом удаляются, легаси с полным — нет', async () => {
        findByEntityId.mockResolvedValue([
            { id: '10', code: 'event_type' }, // короткий код ранней версии
            { id: '11', code: 'EVENT_TYPE' }, // btx-код ранней версии
            { id: '12', code: 'sales_kpi_event_type' }, // корректный полный
            { id: '13', code: 'sales_kpi_other_legacy' }, // чужое легаси-поле
        ]);

        await service.syncWithDb(5, { type: 'kpi', group: 'sales' }, [
            installData,
        ]);

        expect(deleteFieldsByIds).toHaveBeenCalledWith([
            BigInt(10),
            BigInt(11),
        ]);
        expect(upsertFields).toHaveBeenCalledTimes(1);
    });

    it('не-enum поле получает пустые items', async () => {
        const stringData: IPbxListFieldInstallData = {
            ...installData,
            parsedField: { ...parsedField, type: 'string', list: [] },
        };

        await service.syncWithDb(5, { type: 'kpi', group: 'sales' }, [
            stringData,
        ]);

        const [entities] = upsertFields.mock.calls[0] as [
            Array<{ items: unknown[] }>,
        ];
        expect(entities[0].items).toEqual([]);
    });
});
