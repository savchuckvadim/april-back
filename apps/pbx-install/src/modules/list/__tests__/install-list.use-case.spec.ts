import { InstallListUseCase } from '../use-cases/install-list.use-case';
import { PBXService } from '@/modules/pbx';
import { ParseListService } from '../services/parse/parse-list.service';
import { PortalListService } from '@lib/portal-lib/pbx-domain';
import { PortalListFieldInstallService } from '../services/install/portal-list-field-install.service';
import { ListFolderEnum, ListGroupEnum } from '../type/parse.type';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';

/**
 * Тесты оркестратора InstallListUseCase: порядок шагов (upsert строки БД
 * ДО установки полей), gating полей по isNeedUpdate, group из листа Excel
 * (а не из папки шаблона), ошибка при нулевом успехе полей.
 */
describe('InstallListUseCase', () => {
    let useCase: InstallListUseCase;
    let parseListService: { getParsedData: jest.Mock };
    let portalListService: {
        upsertFromBitrix: jest.Mock;
        findRowByDomainAndKeys: jest.Mock;
    };
    let portalSync: { syncWithDb: jest.Mock };
    let getList: jest.Mock;
    let add: jest.Mock;
    let getListFields: jest.Mock;
    let addField: jest.Mock;
    let callBatchWithConcurrency: jest.Mock;
    let callOrder: string[];

    const field: Field = {
        name: 'Дата',
        appType: 'calling',
        type: 'datetime',
        list: [],
        code: 'event_date',
        bxFieldName: 'EVENT_DATE',
        order: 30,
        isNeedUpdate: true,
        isMultiple: false,
    };
    const skippedField: Field = {
        ...field,
        code: 'skipped',
        isNeedUpdate: false,
    };

    beforeEach(() => {
        callOrder = [];
        getList = jest.fn().mockResolvedValue({ result: [] });
        add = jest.fn().mockImplementation(() => {
            callOrder.push('bitrix.lists.add');
            return Promise.resolve({ result: 41 });
        });
        getListFields = jest
            .fn()
            .mockResolvedValueOnce({ result: {} })
            .mockResolvedValue({
                result: {
                    PROPERTY_11: {
                        ID: '11',
                        NAME: 'Дата',
                        CODE: 'EVENT_DATE',
                        TYPE: 'S:DateTime',
                    },
                },
            });
        addField = jest.fn();
        callBatchWithConcurrency = jest.fn().mockImplementation(() => {
            callOrder.push('fields.batch');
            return Promise.resolve([{ result: { event_date: 'PROPERTY_11' } }]);
        });
        const pbxService = {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    list: { getList, add, getListFields },
                    batch: { list: { addField } },
                    api: { callBatchWithConcurrency },
                },
            }),
        } as unknown as PBXService;
        parseListService = {
            getParsedData: jest.fn().mockResolvedValue([
                {
                    id: '0',
                    type: 'presentation',
                    group: 'sales', // group листа != group папки (general)
                    name: 'ОП Презентации',
                    code: 'presentation',
                    order: 30,
                    fields: [field, skippedField],
                },
            ]),
        };
        portalListService = {
            upsertFromBitrix: jest.fn().mockImplementation(() => {
                callOrder.push('db.upsert');
                return Promise.resolve({ id: BigInt(5) });
            }),
            findRowByDomainAndKeys: jest
                .fn()
                .mockRejectedValue(new Error('List not found')),
        };
        portalSync = {
            syncWithDb: jest.fn().mockResolvedValue([]),
        };
        useCase = new InstallListUseCase(
            pbxService,
            parseListService as unknown as ParseListService,
            portalListService as unknown as PortalListService,
            portalSync as unknown as PortalListFieldInstallService,
        );
    });

    it('порядок: создание в Bitrix → upsert строки БД → установка полей', async () => {
        await useCase.execute(
            'test.bitrix24.ru',
            ListFolderEnum.PRESENTATION,
            ListGroupEnum.GENERAL,
        );

        expect(callOrder).toEqual([
            'bitrix.lists.add',
            'db.upsert',
            'fields.batch',
        ]);
    });

    it('в БД пишется group из листа Excel, а не из папки шаблона', async () => {
        await useCase.execute(
            'test.bitrix24.ru',
            ListFolderEnum.PRESENTATION,
            ListGroupEnum.GENERAL,
        );

        expect(portalListService.upsertFromBitrix).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            {
                type: 'presentation',
                group: 'sales',
                name: 'ОП Презентации',
                title: 'ОП Презентации',
                bitrixId: 41,
            },
        );
    });

    it('поля с isNeedUpdate=false не ставятся, синк БД получает только успешные', async () => {
        const result = await useCase.execute(
            'test.bitrix24.ru',
            ListFolderEnum.PRESENTATION,
            ListGroupEnum.GENERAL,
        );

        expect(addField).toHaveBeenCalledTimes(1);
        const addFieldCall = addField.mock.calls[0] as unknown[];
        expect(addFieldCall[0]).toBe('event_date');
        expect(portalSync.syncWithDb).toHaveBeenCalledWith(
            5,
            { type: 'presentation', group: 'sales', code: 'presentation' },
            [expect.objectContaining({ code: 'event_date' })],
        );
        expect(result.installed).toHaveLength(1);
        expect(result.installed[0].portalListId).toBe(5);
    });

    it('нулевой успех установки полей → ошибка', async () => {
        callBatchWithConcurrency.mockResolvedValue([
            { result_error: { event_date: 'err' } },
        ]);

        await expect(
            useCase.execute(
                'test.bitrix24.ru',
                ListFolderEnum.PRESENTATION,
                ListGroupEnum.GENERAL,
            ),
        ).rejects.toThrow('не удалось установить');
    });
});
