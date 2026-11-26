import { librarySummaryOf } from '../lib/library-summary.util';

/**
 * Сводка слепка для списка «Избранного». Формы слепков повторяют боевые:
 * v2 пишет новый конструктор (`schemaVersion: 2`), v1 — легаси, где колонка
 * `rows` хранит набор групп по типу товара (по образцу фикстуры
 * legacy-deal.v1.json фронта).
 */

const priceOf = (sum: number) => ({
    base: sum,
    current: sum,
    quantity: 1,
    month: sum,
    sum,
});

const rowV2 = (over: Record<string, unknown> = {}) => ({
    key: 'general_garant_0',
    setId: 'general',
    role: 'main',
    productType: 'garant',
    refs: {
        complectCode: 'ur',
        supplyCode: 'internet_1',
        contractCode: 'licHalf',
    },
    names: { name: 'Гарант-Юрист', shortName: 'Юрист', alternativeName: null },
    price: priceOf(8008),
    ...over,
});

const snapshotV2 = (
    general: Record<string, unknown>,
    over: Record<string, unknown> = {},
): string =>
    JSON.stringify({
        schemaVersion: 2,
        dealId: 129487,
        domain: 'gsr.bitrix24.ru',
        userId: 447,
        serviceSmartId: null,
        regionCode: 'spb',
        contractCode: 'licHalf',
        supplyCode: 'internet_1',
        general: {
            id: 'general',
            kind: 'general',
            collapsed: false,
            ...general,
        },
        alternative: [],
        templateId: null,
        savedAt: '2026-11-20T10:00:00.000Z',
        ...over,
    });

const rowV1 = (over: Record<string, unknown> = {}) => ({
    number: 1133,
    name: 'Гарант-Эксперт PRO',
    shortName: 'Эксперт PRO',
    type: 'general',
    productType: 'garant',
    id: 0,
    setId: 0,
    complect: { type: 'prof', number: 3 },
    contract: { name: 'Internet', number: 0 },
    supply: { name: 'Интернет 1 ОД', number: 1, type: 'internet' },
    price: {
        default: 8008,
        current: 8008,
        quantity: 1,
        month: 8008,
        sum: 8008,
    },
    ...over,
});

const snapshotV1 = (
    set: Record<string, unknown>,
    over: Record<string, unknown> = {},
): string =>
    JSON.stringify({
        general: [],
        alternative: [],
        show: 'rows',
        sets: { general: [{ id: 0, show: true, ...set }], alternative: [] },
        ...over,
    });

describe('librarySummaryOf: слепок v2', () => {
    it('главная строка даёт комплект, поставку и договор; итог — сумма строк', () => {
        const raw = snapshotV2({
            rows: [
                rowV2(),
                rowV2({
                    key: 'general_lt_1',
                    role: 'additional',
                    productType: 'lt',
                    refs: { supplyCode: 'internet_1', contractCode: 'licHalf' },
                    names: {
                        name: 'Гарант-LegalTech',
                        shortName: 'LegalTech',
                        alternativeName: null,
                    },
                    price: priceOf(1500.55),
                }),
            ],
        });

        expect(librarySummaryOf(raw)).toEqual({
            complect: 'Гарант-Юрист',
            supply: 'Интернет 1 ОД',
            contract: 'Лицензионный полгода',
            sum: 9508.55,
            rowsCount: 2,
        });
    });

    it('главной считается строка с role main, даже если она не первая', () => {
        const raw = snapshotV2({
            rows: [
                rowV2({
                    role: 'additional',
                    names: { name: 'Гарант-Бухгалтер', shortName: 'Бухгалтер' },
                    price: priceOf(100),
                }),
                rowV2({ price: priceOf(200) }),
            ],
        });

        expect(librarySummaryOf(raw)?.complect).toBe('Гарант-Юрист');
        expect(librarySummaryOf(raw)?.sum).toBe(300);
    });

    it('нет полного названия — берётся короткое', () => {
        const raw = snapshotV2({
            rows: [rowV2({ names: { name: ' ', shortName: 'Юрист' } })],
        });

        expect(librarySummaryOf(raw)?.complect).toBe('Юрист');
    });

    it('ручной итог свёрнутой строки главнее суммы строк', () => {
        const raw = snapshotV2({
            collapsed: true,
            rows: [rowV2(), rowV2({ role: 'additional', price: priceOf(500) })],
            totalPrice: priceOf(7000),
        });

        expect(librarySummaryOf(raw)?.sum).toBe(7000);
    });

    it('неизвестные коды отдаются как есть', () => {
        const raw = snapshotV2({
            rows: [
                rowV2({
                    refs: {
                        supplyCode: 'internet_77',
                        contractCode: 'newType',
                    },
                }),
            ],
        });

        const summary = librarySummaryOf(raw);
        expect(summary?.supply).toBe('internet_77');
        expect(summary?.contract).toBe('newType');
    });

    it('коды «unknown» в строке заменяются кодами верхнего уровня слепка', () => {
        const raw = snapshotV2({
            rows: [
                rowV2({
                    refs: { supplyCode: 'unknown', contractCode: 'unknown' },
                }),
            ],
        });

        const summary = librarySummaryOf(raw);
        expect(summary?.supply).toBe('Интернет 1 ОД');
        expect(summary?.contract).toBe('Лицензионный полгода');
    });

    it('главная строка без комплекта (только сервисная): комплект пуст', () => {
        const raw = snapshotV2({
            rows: [
                rowV2({
                    role: 'additional',
                    productType: 'star',
                    names: { name: 'СТАР', shortName: 'СТАР' },
                }),
            ],
        });

        expect(librarySummaryOf(raw)).toMatchObject({
            complect: null,
            rowsCount: 1,
        });
    });

    it('набор без строк и слепок без общего набора — null', () => {
        expect(librarySummaryOf(snapshotV2({ rows: [] }))).toBeNull();
        expect(
            librarySummaryOf(JSON.stringify({ schemaVersion: 2 })),
        ).toBeNull();
    });

    it('мусор вместо строк не роняет разбор', () => {
        const raw = snapshotV2({
            rows: [null, 5, 'строка', [], { names: 7, refs: 'x', price: [] }],
        });

        expect(librarySummaryOf(raw)).toEqual({
            complect: null,
            supply: 'Интернет 1 ОД',
            contract: 'Лицензионный полгода',
            sum: null,
            rowsCount: 1,
        });
    });
});

describe('librarySummaryOf: слепок v1 (легаси)', () => {
    it('одна строка Гаранта: названия из строки, договор по номеру', () => {
        const raw = snapshotV1({ rows: { garant: [rowV1()], lt: [] } });

        expect(librarySummaryOf(raw)).toEqual({
            complect: 'Гарант-Эксперт PRO',
            supply: 'Интернет 1 ОД',
            // сохранённое имя договора «Internet» латиницей; номер 0 даёт «Интернет»
            contract: 'Интернет',
            sum: 8008,
            rowsCount: 1,
        });
    });

    it('строки всех групп: итог — сумма, главная — id 0', () => {
        const raw = snapshotV1({
            rows: {
                garant: [
                    rowV1({
                        id: 1,
                        name: 'Гарант-Бухгалтер',
                        price: { sum: 100 },
                    }),
                    rowV1({ price: { sum: 8008 } }),
                ],
                lt: [
                    rowV1({
                        id: 2,
                        productType: 'lt',
                        name: 'LegalTech',
                        price: { sum: 1000.5 },
                    }),
                ],
                consalting: [],
                star: [],
            },
        });

        expect(librarySummaryOf(raw)).toMatchObject({
            complect: 'Гарант-Эксперт PRO',
            sum: 9108.5,
            rowsCount: 3,
        });
    });

    it('нет строки с id 0: главной берётся первый Гарант', () => {
        const raw = snapshotV1({
            rows: {
                garant: [rowV1({ id: 4, name: 'Гарант-Офис' })],
                lt: [rowV1({ id: 5, productType: 'lt', name: 'LegalTech' })],
            },
        });

        expect(librarySummaryOf(raw)?.complect).toBe('Гарант-Офис');
    });

    it('свёрнутый набор (show: set): итог из total-строки', () => {
        const raw = snapshotV1(
            {
                rows: {
                    garant: [rowV1(), rowV1({ id: 1, price: { sum: 500 } })],
                },
                total: [rowV1({ price: { sum: 7000 } })],
            },
            { show: 'set' },
        );

        expect(librarySummaryOf(raw)?.sum).toBe(7000);
    });

    it('развёрнутый набор: total-строка игнорируется, суммируются строки', () => {
        const raw = snapshotV1({
            rows: { garant: [rowV1(), rowV1({ id: 1, price: { sum: 500 } })] },
            total: [rowV1({ price: { sum: 7000 } })],
        });

        expect(librarySummaryOf(raw)?.sum).toBe(8508);
    });

    it('поставка и договор только номерами: имена по таблицам каталога', () => {
        const raw = snapshotV1({
            rows: {
                garant: [
                    rowV1({
                        supply: { number: 4 },
                        contract: { number: 4 },
                    }),
                ],
            },
        });

        const summary = librarySummaryOf(raw);
        expect(summary?.supply).toBe('Интернет 5 ОД');
        expect(summary?.contract).toBe('Лицензионный полгода');
    });

    it('договор вне таблицы: остаётся сохранённое имя', () => {
        const raw = snapshotV1({
            rows: {
                garant: [rowV1({ contract: { number: 99, name: 'Особый' } })],
            },
        });

        expect(librarySummaryOf(raw)?.contract).toBe('Особый');
    });

    it('строки без цены: сумма null, строки посчитаны', () => {
        const raw = snapshotV1({
            rows: { garant: [rowV1({ price: undefined })] },
        });

        expect(librarySummaryOf(raw)).toMatchObject({
            sum: null,
            rowsCount: 1,
        });
    });

    it('набор без строк и старый плоский формат — null', () => {
        expect(
            librarySummaryOf(snapshotV1({ rows: { garant: [] } })),
        ).toBeNull();
        expect(
            librarySummaryOf(
                JSON.stringify({
                    general: [],
                    alternative: [],
                    sets: { general: [] },
                }),
            ),
        ).toBeNull();
    });
});

describe('librarySummaryOf: битые и пустые слепки', () => {
    it.each([
        ['null', null],
        ['undefined', undefined],
        ['пустая строка', ''],
        ['пробелы', '   '],
        ['строка null', 'null'],
        ['массив', '[]'],
        ['число', '42'],
        ['пустой объект', '{}'],
        ['обрезанный JSON', '{"schemaVersion":2,"general":{"rows":[{"names"'],
        ['не JSON', 'просто текст'],
        ['схема без наборов', '{"schemaVersion":2,"general":null}'],
        ['sets не объект', '{"sets":"x"}'],
        ['general не массив', '{"sets":{"general":5}}'],
    ])('%s → null без исключения', (_title, raw) => {
        expect(librarySummaryOf(raw)).toBeNull();
    });
});
