import { PBXService } from '@/modules/pbx';
import { BitrixEnumerationOption } from '@/modules/bitrix';
import { BxEntityFieldsInstallService } from './bx-entity-field-install.service';
import { ListItemDto } from '../../parse-field-excel';

type ListBuilder = (
    list: ListItemDto[],
    bitrixList?: BitrixEnumerationOption[],
) => BitrixEnumerationOption[];

describe('BxEntityFieldsInstallService.getBxFieldListDataByParseField', () => {
    let buildList: ListBuilder;

    beforeEach(() => {
        const service = new BxEntityFieldsInstallService(
            'april-garant.bitrix24.ru',
            {} as PBXService,
            'deal',
            [],
        );
        buildList = (list, bitrixList) =>
            (
                service as unknown as {
                    getBxFieldListDataByParseField: ListBuilder;
                }
            ).getBxFieldListDataByParseField(list, bitrixList);
    });

    const kodexParsed: ListItemDto = {
        VALUE: 'Кодекс',
        DEL: 'N',
        XML_ID: 'kodex',
        CODE: 'kodex',
        SORT: 30,
    };

    it('для нового элемента отправляет XML_ID из CODE', () => {
        const [item] = buildList([kodexParsed], []);

        expect(item.XML_ID).toBe('kodex');
        expect(item.ID).toBeUndefined();
    });

    it('для существующего элемента (матч по VALUE) перезаписывает XML_ID на CODE и шлёт ID', () => {
        const [item] = buildList(
            [kodexParsed],
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

        expect(item.ID).toBe('11478');
        expect(item.XML_ID).toBe('kodex');
    });
});
