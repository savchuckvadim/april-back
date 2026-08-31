import { buildCrmLinkValue, hasCrmLink } from '../lib/crm-link-value';
import { parseSmartElementIdsFromTaskBindings } from '../lib/smart-task-binding';
import { parseSmartElementIdsFromTaskBindings as parseFromBarrel } from '..';

/**
 * Формат crm-связей смартов: ЗАПИСЬ подстраивается под настройки поля
 * (инцидент 31.08 — «Основная сделка/Компания/Лид» не сохранялись, потому
 * что в одиночные однотипные поля уезжал массив с префиксом), ЧТЕНИЕ терпит
 * оба поколения формата, привязка задачи парсится в id элементов смарта.
 */
describe('buildCrmLinkValue', () => {
    it('одиночное однотипное поле — голый числовой id', () => {
        expect(buildCrmLinkValue({ crmEntities: ['DEAL'] }, 'D', 25359)).toBe(
            25359,
        );
    });

    it('мультитипное поле — префиксная строка', () => {
        expect(
            buildCrmLinkValue({ crmEntities: ['DEAL', 'COMPANY'] }, 'D', 25359),
        ).toBe('D_25359');
    });

    it('множественное поле — значение в массиве', () => {
        expect(
            buildCrmLinkValue(
                { crmEntities: ['DEAL'], isMultiple: true },
                'D',
                100,
            ),
        ).toEqual([100]);
    });

    it('поле не найдено в реестре — безопасный префиксный формат', () => {
        // Префикс читается обеими ветками hasCrmLink: значение в худшем
        // случае сохранится в менее удобной форме, а не потеряется.
        expect(buildCrmLinkValue(undefined, 'CO', 431)).toBe('CO_431');
    });

    it('строковый id приводится к числу', () => {
        expect(buildCrmLinkValue({ crmEntities: ['LEAD'] }, 'L', '42')).toBe(
            42,
        );
    });

    it('невалидный id — null (поле не пишется)', () => {
        expect(buildCrmLinkValue({ crmEntities: ['DEAL'] }, 'D', 0)).toBeNull();
        expect(
            buildCrmLinkValue({ crmEntities: ['DEAL'] }, 'D', NaN),
        ).toBeNull();
        expect(
            buildCrmLinkValue({ crmEntities: ['DEAL'] }, 'D', -5),
        ).toBeNull();
    });
});

describe('hasCrmLink', () => {
    it('матчится префиксная строка в массиве (историческое поколение)', () => {
        expect(hasCrmLink(['D_100'], 'D', 100)).toBe(true);
    });

    it('матчится голый id — строкой и числом, скаляром и в массиве', () => {
        expect(hasCrmLink('100', 'D', 100)).toBe(true);
        expect(hasCrmLink(100, 'D', 100)).toBe(true);
        expect(hasCrmLink([100], 'D', 100)).toBe(true);
    });

    it('чужой id не матчится', () => {
        expect(hasCrmLink(['D_999'], 'D', 100)).toBe(false);
        expect(hasCrmLink(999, 'D', 100)).toBe(false);
    });

    it('пустые значения не матчатся', () => {
        expect(hasCrmLink(null, 'D', 100)).toBe(false);
        expect(hasCrmLink(undefined, 'D', 100)).toBe(false);
        expect(hasCrmLink([], 'D', 100)).toBe(false);
    });
});

describe('parseSmartElementIdsFromTaskBindings', () => {
    // hex(1060) = '424' — живой пример инцидента: T424_15 = элемент 15.
    it('достаёт id элементов СВОЕГО смарта из смешанных привязок', () => {
        expect(
            parseSmartElementIdsFromTaskBindings(
                ['L_330743', 'D_25359', 'CO_167075', 'T424_15'],
                1060,
            ),
        ).toEqual([15]);
    });

    it('чужой смарт (другой entityTypeId) отфильтровывается', () => {
        expect(parseSmartElementIdsFromTaskBindings(['T424_15'], 1038)).toEqual(
            [],
        );
    });

    it('регистр hex не важен', () => {
        expect(parseSmartElementIdsFromTaskBindings(['T40E_7'], 1038)).toEqual([
            7,
        ]);
    });

    it('дубли схлопываются, порядок сохраняется', () => {
        expect(
            parseSmartElementIdsFromTaskBindings(
                ['T424_15', 'T424_3', 'T424_15'],
                1060,
            ),
        ).toEqual([15, 3]);
    });

    it('не-массив и мусор внутри массива не роняют', () => {
        expect(parseSmartElementIdsFromTaskBindings(undefined, 1060)).toEqual(
            [],
        );
        expect(parseSmartElementIdsFromTaskBindings('T424_15', 1060)).toEqual(
            [],
        );
        expect(
            parseSmartElementIdsFromTaskBindings([null, 42, 'T424_x'], 1060),
        ).toEqual([]);
    });

    it('экспортируется из бареля const-smart-registry', () => {
        // Потоки импортируют через барель — разъезд сломал бы оба смарта.
        expect(parseFromBarrel).toBe(parseSmartElementIdsFromTaskBindings);
    });
});
