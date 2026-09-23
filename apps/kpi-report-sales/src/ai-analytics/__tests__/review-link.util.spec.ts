import { parseSmartItemLink } from '../review/review-link.util';

describe('parseSmartItemLink', () => {
    it('ссылка на карточку элемента смарта → домен (в нижнем регистре), entityTypeId, itemId', () => {
        expect(
            parseSmartItemLink(
                ' https://April.Bitrix24.ru/crm/type/1036/details/128/ ',
            ),
        ).toEqual({
            domain: 'april.bitrix24.ru',
            entityTypeId: 1036,
            itemId: 128,
        });
    });

    it('хвост без слэша, с параметрами и якорем допускается', () => {
        expect(
            parseSmartItemLink(
                'https://april.bitrix24.ru/crm/type/1036/details/128?tab=main#x',
            ),
        ).toEqual({
            domain: 'april.bitrix24.ru',
            entityTypeId: 1036,
            itemId: 128,
        });
    });

    it('не карточка элемента: http, другой путь, нулевые id, произвольный текст', () => {
        for (const link of [
            'http://april.bitrix24.ru/crm/type/1036/details/128/',
            'https://april.bitrix24.ru/crm/deal/details/128/',
            'https://april.bitrix24.ru/crm/type/0/details/128/',
            'https://april.bitrix24.ru/crm/type/1036/details/0/',
            'https://april.bitrix24.ru/crm/type/1036/',
            'разбор 128',
            '',
        ]) {
            expect(parseSmartItemLink(link)).toBeNull();
        }
    });
});
