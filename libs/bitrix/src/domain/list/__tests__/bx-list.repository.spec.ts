import { BxListRepository } from '../repository/bx-list.repository';
import { BitrixBaseApi } from '../../../core/base/bitrix-base-api';
import { EBxNamespace } from '../../../core';
import { EBxMethod } from '../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../core/domain/consts/bitrix-entities.enum';
import { IBXListFieldPayload } from '../interface/bx-list.interface';

/**
 * Тесты маппинга параметров BxListRepository → callType/addCmdBatchType.
 * Ошибка в IBLOCK_TYPE_ID/методе уводит запрос в другой REST-метод Bitrix,
 * поэтому фиксируем контракт всех операций lists.* / lists.field.*.
 */
describe('BxListRepository', () => {
    let repo: BxListRepository;
    let callType: jest.Mock;
    let addCmdBatchType: jest.Mock;

    beforeEach(() => {
        callType = jest.fn().mockResolvedValue({ result: true });
        addCmdBatchType = jest.fn();
        const api = { callType, addCmdBatchType } as unknown as BitrixBaseApi;
        repo = new BxListRepository(api);
    });

    it('getList зовёт lists.get с IBLOCK_TYPE_ID=lists и кодом', async () => {
        await repo.getList('sales_kpi');
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.GET,
            { IBLOCK_TYPE_ID: 'lists', IBLOCK_CODE: 'sales_kpi' },
        );
    });

    it('add оборачивает поля в FIELDS и зовёт lists.add', async () => {
        await repo.add('kpi', { NAME: 'ОП KPI' });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.ADD,
            {
                IBLOCK_TYPE_ID: 'lists',
                IBLOCK_CODE: 'kpi',
                FIELDS: { NAME: 'ОП KPI' },
            },
        );
    });

    it('update зовёт lists.update с FIELDS', async () => {
        await repo.update('kpi', { NAME: 'Новое имя' });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.UPDATE,
            {
                IBLOCK_TYPE_ID: 'lists',
                IBLOCK_CODE: 'kpi',
                FIELDS: { NAME: 'Новое имя' },
            },
        );
    });

    it('delete зовёт lists.delete только с кодом', async () => {
        await repo.delete('kpi');
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.DELETE,
            { IBLOCK_TYPE_ID: 'lists', IBLOCK_CODE: 'kpi' },
        );
    });

    it('addField зовёт lists.field.add с типизированным payload', async () => {
        const payload: IBXListFieldPayload = {
            NAME: 'Тип События',
            TYPE: 'L',
            CODE: 'EVENT_TYPE',
            SORT: 40,
            LIST: {
                n0: { VALUE: 'Звонок', SORT: 10, DEF: 'N' },
                n1: { VALUE: 'Презентация', SORT: 20, DEF: 'N' },
            },
        };
        await repo.addField('kpi', payload);
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_ADD,
            { IBLOCK_TYPE_ID: 'lists', IBLOCK_CODE: 'kpi', FIELDS: payload },
        );
    });

    it('updateField передаёт FIELD_ID вместе с FIELDS', async () => {
        await repo.updateField('kpi', 'PROPERTY_101', { NAME: 'Дата' });
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_UPDATE,
            {
                IBLOCK_TYPE_ID: 'lists',
                IBLOCK_CODE: 'kpi',
                FIELD_ID: 'PROPERTY_101',
                FIELDS: { NAME: 'Дата' },
            },
        );
    });

    it('deleteField зовёт lists.field.delete c FIELD_ID', async () => {
        await repo.deleteField('kpi', 'PROPERTY_101');
        expect(callType).toHaveBeenCalledWith(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_DELETE,
            {
                IBLOCK_TYPE_ID: 'lists',
                IBLOCK_CODE: 'kpi',
                FIELD_ID: 'PROPERTY_101',
            },
        );
    });

    it('batch-варианты накапливают команду через addCmdBatchType с cmdCode', () => {
        repo.addFieldBtch('cmd_add_field', 'kpi', { NAME: 'Дата' });
        repo.updateFieldBtch('cmd_upd_field', 'kpi', 'PROPERTY_1', {
            NAME: 'Дата',
        });
        repo.deleteFieldBtch('cmd_del_field', 'kpi', 'PROPERTY_1');
        repo.getListFieldsBtch('cmd_get_fields', 'kpi');

        expect(addCmdBatchType).toHaveBeenNthCalledWith(
            1,
            'cmd_add_field',
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_ADD,
            {
                IBLOCK_TYPE_ID: 'lists',
                IBLOCK_CODE: 'kpi',
                FIELDS: { NAME: 'Дата' },
            },
        );
        expect(addCmdBatchType).toHaveBeenNthCalledWith(
            3,
            'cmd_del_field',
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.LISTS,
            EBxMethod.FIELD_DELETE,
            {
                IBLOCK_TYPE_ID: 'lists',
                IBLOCK_CODE: 'kpi',
                FIELD_ID: 'PROPERTY_1',
            },
        );
        expect(addCmdBatchType).toHaveBeenCalledTimes(4);
    });
});
