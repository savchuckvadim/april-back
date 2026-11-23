import { getInvoiceDocumentProductName } from '../lib/get-invoice-document-product-name';

type Sets = Parameters<typeof getInvoiceDocumentProductName>[0]['sets'];

const garant = (
    name: string,
    supplyName: string,
    alternativeName?: string,
) => ({
    name,
    alternativeName,
    supply: { name: supplyName },
});

const set = (...rows: ReturnType<typeof garant>[]) => ({
    rows: { garant: rows },
});

const sets: Sets = {
    general: [
        set(garant('Гарант-Юрист', 'Интернет 5 ОД')),
        set(garant('Гарант-Бухгалтер', 'Проксима 3 ОД')),
    ],
    alternative: [
        set(garant('Гарант-Эксперт', 'Интернет 1 ОД')),
        set(garant('Гарант-Строитель', 'Интернет 2 ОД', 'Строитель PRO')),
    ],
};

describe('getInvoiceDocumentProductName', () => {
    it('первый счёт из general — по первой строке Гаранта первого набора', () => {
        expect(getInvoiceDocumentProductName({ sets }, 'general', 0, 0)).toBe(
            'Счёт Гарант-Юрист - Интернет 5 ОД',
        );
    });

    it('второй счёт из второго набора general называется по своему набору', () => {
        expect(getInvoiceDocumentProductName({ sets }, 'general', 1, 1)).toBe(
            'Счёт Гарант-Бухгалтер - Проксима 3 ОД',
        );
    });

    it('счёт из alternative называется по своему набору для сравнения', () => {
        // индекс набора для сравнения — 1, место счёта в списке документов — третье
        expect(
            getInvoiceDocumentProductName({ sets }, 'alternative', 1, 2),
        ).toBe('Счёт Строитель PRO - Интернет 2 ОД');
        expect(
            getInvoiceDocumentProductName({ sets }, 'alternative', 0, 1),
        ).toBe('Счёт Гарант-Эксперт - Интернет 1 ОД');
    });

    it('счёт только из alternative стоит первым в списке и называется по набору для сравнения', () => {
        expect(
            getInvoiceDocumentProductName({ sets }, 'alternative', 0, 0),
        ).toBe('Счёт Гарант-Эксперт - Интернет 1 ОД');
    });

    it('в имени альтернативное название строки важнее обычного', () => {
        expect(
            getInvoiceDocumentProductName({ sets }, 'alternative', 1, 1),
        ).toContain('Строитель PRO');
        expect(
            getInvoiceDocumentProductName({ sets }, 'alternative', 1, 1),
        ).not.toContain('Гарант-Строитель');
    });

    it('у строки нет поставки — имя заканчивается разделителем, как раньше', () => {
        const noSupply: Sets = {
            general: [{ rows: { garant: [{ name: 'Гарант-Юрист' }] } }],
        };

        expect(
            getInvoiceDocumentProductName({ sets: noSupply }, 'general', 0, 0),
        ).toBe('Счёт Гарант-Юрист - ');
    });

    describe('запасные имена, когда строки Гаранта нет', () => {
        const empty: Sets = {
            general: [set(), { rows: {} }, {}],
            alternative: [set()],
        };

        it('первый счёт в списке — «Счёт»', () => {
            expect(
                getInvoiceDocumentProductName({ sets: empty }, 'general', 0, 0),
            ).toBe('Счёт');
        });

        it('следующие счета — «Счёт - N» по месту в списке', () => {
            expect(
                getInvoiceDocumentProductName({ sets: empty }, 'general', 1, 1),
            ).toBe('Счёт - 1');
            expect(
                getInvoiceDocumentProductName(
                    { sets: empty },
                    'alternative',
                    0,
                    2,
                ),
            ).toBe('Счёт - 2');
        });

        it('набора с таким индексом нет — тоже запасное имя', () => {
            expect(
                getInvoiceDocumentProductName({ sets }, 'general', 7, 3),
            ).toBe('Счёт - 3');
        });

        it('наборов в запросе нет вовсе — запасное имя', () => {
            expect(getInvoiceDocumentProductName({}, 'general', 0, 0)).toBe(
                'Счёт',
            );
            expect(getInvoiceDocumentProductName({}, 'alternative', 0, 1)).toBe(
                'Счёт - 1',
            );
        });
    });

    it('слово «Счёт» пишется кириллицей: первая буква — U+0421', () => {
        const names = [
            getInvoiceDocumentProductName({ sets }, 'general', 0, 0),
            getInvoiceDocumentProductName({ sets }, 'alternative', 1, 1),
            getInvoiceDocumentProductName({}, 'general', 0, 0),
            getInvoiceDocumentProductName({}, 'general', 0, 2),
        ];

        for (const name of names) {
            const firstWord = name.split(' ')[0];
            // С, ч, ё, т
            expect([...firstWord].map(char => char.codePointAt(0))).toEqual([
                0x0421, 0x0447, 0x0451, 0x0442,
            ]);
        }
    });
});
