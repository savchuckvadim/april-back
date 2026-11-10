import { contractCityOf } from '../lib/contract-city.util';

describe('contractCityOf — город договора из адреса поставщика', () => {
    it('«г. Город» и «город Город»', () => {
        expect(
            contractCityOf(
                '355000, Ставропольский край, г. Ставрополь, ул. Ленина, 1',
            ),
        ).toBe('г. Ставрополь');
        expect(contractCityOf('Россия, город Нальчик, пр. Ленина 5')).toBe(
            'г. Нальчик',
        );
        expect(contractCityOf('г Ростов-на-Дону, ул. Пушкина')).toBe(
            'г. Ростов-на-Дону',
        );
    });

    it('обратный порядок ФНС: «Москва г,»', () => {
        expect(contractCityOf('125009, Москва г, Тверская ул, д 1')).toBe(
            'г. Москва',
        );
    });

    it('«г» на конце слова — не сокращение «город»', () => {
        expect(contractCityOf('Таганрог Ростовской обл., ул. Чехова')).toBe('');
    });

    it('нет адреса или города — пусто', () => {
        expect(contractCityOf(undefined)).toBe('');
        expect(contractCityOf('ул. Ленина, 1')).toBe('');
    });
});
