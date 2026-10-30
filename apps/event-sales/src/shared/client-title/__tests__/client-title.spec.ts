import {
    clientTitleOrNull,
    isCallKindTitle,
    isCrmPlaceholderTitle,
    isNumberTitle,
} from '../client-title';

describe('clientTitleOrNull', () => {
    it('обычное название — как есть, без пробелов по краям', () => {
        expect(clientTitleOrNull('  МКУ «ЦЕНТР БУХГАЛТЕРСКОГО УЧЕТА» ')).toBe(
            'МКУ «ЦЕНТР БУХГАЛТЕРСКОГО УЧЕТА»',
        );
        expect(clientTitleOrNull('ООО "ЖКС №1", ИНН 7817313973')).toBe(
            'ООО "ЖКС №1", ИНН 7817313973',
        );
    });

    it('ИНН вместо названия компании (лид 196219) — null', () => {
        expect(clientTitleOrNull('4703142743')).toBeNull();
        expect(clientTitleOrNull('ИНН 3110023165')).toBeNull();
        expect(clientTitleOrNull('231 019 0443')).toBeNull();
    });

    it('вид звонка вместо названия ХО — null', () => {
        expect(clientTitleOrNull('Холодный обзвон')).toBeNull();
        expect(clientTitleOrNull('ХОЛОДНЫЙ  ОБЗВОН')).toBeNull();
        expect(clientTitleOrNull('холодный звонок')).toBeNull();
    });

    it('название списка с видом звонка — это название, не заглушка', () => {
        expect(
            clientTitleOrNull('Холодный обзвон В работу Лиды-заявки с сайта'),
        ).toBe('Холодный обзвон В работу Лиды-заявки с сайта');
    });

    it('заглушка Битрикса вместо названия — null', () => {
        expect(clientTitleOrNull('Сделка #110153')).toBeNull();
        expect(clientTitleOrNull('сделка 110153')).toBeNull();
        expect(clientTitleOrNull('Лид #42')).toBeNull();
        expect(isCrmPlaceholderTitle('Сделка с ООО Ромашка')).toBe(false);
    });

    it('пусто и не строка — null', () => {
        expect(clientTitleOrNull('   ')).toBeNull();
        expect(clientTitleOrNull(null)).toBeNull();
        expect(clientTitleOrNull(4703142743)).toBeNull();
    });
});

describe('признаки заглушек', () => {
    it('номер с буквами — не номер', () => {
        expect(isNumberTitle('Школа 404')).toBe(false);
        expect(isNumberTitle('№ 12345')).toBe(true);
    });

    it('«Холодный обзвон ООО Ромашка» — не заглушка', () => {
        expect(isCallKindTitle('Холодный обзвон ООО Ромашка')).toBe(false);
    });
});
