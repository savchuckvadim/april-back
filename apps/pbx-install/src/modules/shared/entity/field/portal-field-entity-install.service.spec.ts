import { PbxFieldEntity, PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { IBXField } from '@/modules/bitrix';
import { PbxEntityType } from '@/shared';
import {
    IPbxFieldInstallData,
    PortalEntityFieldInstallService,
} from './portal-field-entity-install.service';
import { Field } from '../../parse-field-excel/type/parse-field.type';

const buildEnumField = (
    parsedList: Field['list'],
    bxList: IBXField['LIST'],
): IPbxFieldInstallData => {
    const parsedField: Field = {
        name: 'Конкуренты',
        appType: 'service_event',
        type: 'enumeration',
        list: parsedList,
        code: 'concurents_multiple',
        bxFieldName: 'CONCURENTS_MULTIPLE',
        order: 575,
        isNeedUpdate: true,
        isMultiple: true,
    };
    const bxField = {
        FIELD_NAME: 'UF_CRM_CONCURENTS_MULTIPLE',
        LIST: bxList,
    } as unknown as IBXField;

    return { code: 'concurents_multiple', result: 1, parsedField, bxField };
};

describe('PortalEntityFieldInstallService', () => {
    let service: PortalEntityFieldInstallService;
    let upsertFields: jest.Mock;

    beforeEach(() => {
        upsertFields = jest
            .fn()
            .mockImplementation((entities: PbxFieldEntity[]) =>
                Promise.resolve(entities),
            );
        service = new PortalEntityFieldInstallService({
            upsertFields,
        } as unknown as PbxFieldService);
    });

    it('берёт code элемента из шаблонного CODE при совпадении по VALUE, а не из bx XML_ID-хэша', async () => {
        const field = buildEnumField(
            [
                {
                    VALUE: 'Кодекс',
                    DEL: 'N',
                    XML_ID: 'kodex',
                    CODE: 'kodex',
                    SORT: 30,
                },
            ],
            [
                {
                    ID: '11478',
                    VALUE: 'Кодекс',
                    XML_ID: '686d353baaf4f5e532bf9834cec6b826',
                    SORT: '30',
                    DEF: 'N',
                },
            ],
        );

        const [result] = await service.syncWithDb(PbxEntityType.DEAL, 1, [
            field,
        ]);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].code).toBe('kodex');
        expect(result.items[0].bitrixId).toBe(11478);
    });

    it('матчит элемент по XML_ID, если VALUE в Bitrix отличается', async () => {
        const field = buildEnumField(
            [
                {
                    VALUE: 'Кодекс (старое имя)',
                    DEL: 'N',
                    XML_ID: 'kodex',
                    CODE: 'kodex',
                    SORT: 30,
                },
            ],
            [
                {
                    ID: '11478',
                    VALUE: 'Кодекс',
                    XML_ID: 'kodex',
                    SORT: '30',
                    DEF: 'N',
                },
            ],
        );

        const [result] = await service.syncWithDb(PbxEntityType.DEAL, 1, [
            field,
        ]);

        expect(result.items[0].code).toBe('kodex');
    });

    it('падает обратно на bx XML_ID, если соответствия в шаблоне нет', async () => {
        const field = buildEnumField(
            [
                {
                    VALUE: 'Другое значение',
                    DEL: 'N',
                    XML_ID: 'other',
                    CODE: 'other',
                    SORT: 10,
                },
            ],
            [
                {
                    ID: '11478',
                    VALUE: 'Кодекс',
                    XML_ID: '686d353baaf4f5e532bf9834cec6b826',
                    SORT: '30',
                    DEF: 'N',
                },
            ],
        );

        const [result] = await service.syncWithDb(PbxEntityType.DEAL, 1, [
            field,
        ]);

        expect(result.items[0].code).toBe('686d353baaf4f5e532bf9834cec6b826');
    });
});
