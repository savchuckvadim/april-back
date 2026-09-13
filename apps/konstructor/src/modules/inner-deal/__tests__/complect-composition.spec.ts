import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
    isSingleContractAllowed,
    parseComplectComposition,
    serializeComplectComposition,
} from '../type/complect-composition.type';

/**
 * Настройки сборки комплекта живут строкой в колонке `settings`. Разбор обязан
 * быть неубиваемым: слепок с испорченными настройками должен открываться без
 * них, а не ронять восстановление сделки целиком.
 */
describe('complect composition', () => {
    it('пустая колонка — настроек нет', () => {
        expect(parseComplectComposition(null)).toBeNull();
        expect(parseComplectComposition('')).toBeNull();
    });

    it('битый JSON не бросает, а даёт null', () => {
        expect(parseComplectComposition('{не json')).toBeNull();
        expect(parseComplectComposition('"строка"')).toBeNull();
    });

    it('читает режим, участников и настройки КП', () => {
        const composition = parseComplectComposition(
            JSON.stringify({
                mode: 'single_contract',
                offer: { infoblocks: 'merged', showAlternatives: true },
            }),
        );

        expect(composition).toEqual({
            mode: ComplectModeEnum.SINGLE_CONTRACT,
            offer: {
                infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                showAlternatives: true,
            },
        });
    });

    it('незнакомый режим не ломает сделку — падаем на compare', () => {
        const composition = parseComplectComposition(
            JSON.stringify({ mode: 'megacomplect' }),
        );

        expect(composition?.mode).toBe(ComplectModeEnum.COMPARE);
        expect(composition?.offer.infoblocks).toBe(
            ComplectOfferInfoblocksEnum.INDEPENDENT,
        );
    });

    it('сериализация и разбор дают то же самое', () => {
        const composition = {
            mode: ComplectModeEnum.MULTI_CONTRACT,
            offer: {
                infoblocks: ComplectOfferInfoblocksEnum.INDEPENDENT,
                showAlternatives: false,
            },
        };

        expect(
            parseComplectComposition(serializeComplectComposition(composition)),
        ).toEqual(composition);
    });

    it('настроек нет — в колонку пишем null, а не строку "null"', () => {
        expect(serializeComplectComposition(null)).toBeNull();
        expect(serializeComplectComposition(undefined)).toBeNull();
    });

    describe('один договор на несколько наборов', () => {
        it('разрешён только при одинаковом типе договора', () => {
            expect(isSingleContractAllowed(['abonYear', 'abonYear'])).toBe(
                true,
            );
        });

        it('типы разные — запрещён', () => {
            expect(isSingleContractAllowed(['abonYear', 'licYear'])).toBe(
                false,
            );
        });

        it('типов нет — запрещён, а не «разрешён по умолчанию»', () => {
            expect(isSingleContractAllowed([])).toBe(false);
            expect(isSingleContractAllowed(['', ''])).toBe(false);
        });
    });
});
