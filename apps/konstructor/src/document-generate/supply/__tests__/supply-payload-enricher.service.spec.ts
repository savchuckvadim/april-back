import { ProductRowDto } from '../../dto/product-row/product-row.dto';
import {
    ProductRowSetDto,
    ProductRowSetItemDto,
} from '../../dto/product-row-set/product-row-set.dto';
import {
    SupplyCaptionPayload,
    SupplyEnrichMemo,
    SupplyPayloadEnricherService,
} from '../supply-payload-enricher.service';
import {
    captionRow,
    createSupplyKit,
    fullSet,
    INTERNET_10_CAPTION,
    INTERNET_5_CAPTION,
    INTERNET_7_CAPTION,
    supplyDto,
} from './supply-caption.fixtures';

const build = () => {
    const kit = createSupplyKit();
    return {
        ...kit,
        enricher: new SupplyPayloadEnricherService(kit.supplyTexts),
    };
};

const quantityOf = (rows?: ProductRowDto[]): string | undefined =>
    rows?.[0]?.product.quantityForKp;

const forkpOf = (rows?: ProductRowDto[]): string | undefined =>
    rows?.[0]?.supply?.forkp;

/** Подпись КП первой строки каждого типа набора и его итога. */
const quantityCaptions = (set: ProductRowSetDto) => ({
    garant: quantityOf(set.rows.garant),
    lt: quantityOf(set.rows.lt),
    lt_other: quantityOf(set.rows.lt_other),
    consalting: quantityOf(set.rows.consalting),
    star: quantityOf(set.rows.star),
    academy: quantityOf(set.rows.academy),
    total: quantityOf(set.total),
});

/** Подпись поставки (`supply.forkp`) первой строки каждого типа набора и его итога. */
const forkpCaptions = (set: ProductRowSetDto) => ({
    garant: forkpOf(set.rows.garant),
    lt: forkpOf(set.rows.lt),
    lt_other: forkpOf(set.rows.lt_other),
    consalting: forkpOf(set.rows.consalting),
    star: forkpOf(set.rows.star),
    academy: forkpOf(set.rows.academy),
    total: forkpOf(set.total),
});

const allCaptions = (caption: string) => ({
    garant: caption,
    lt: caption,
    lt_other: caption,
    consalting: caption,
    star: caption,
    academy: caption,
    total: caption,
});

describe('SupplyPayloadEnricherService: наборы строк', () => {
    describe('enrichSets', () => {
        it('пустые подписи дополняются во всех ключах набора и в итоге набора, основного и для сравнения', async () => {
            const { enricher } = build();
            const supply = supplyDto('internet_5', 5);
            const sets = {
                general: [fullSet(1, supply)],
                alternative: [fullSet(2, supply)],
            };

            const result = await enricher.enrichSets(sets);

            for (const set of [...result.general, ...result.alternative]) {
                expect(quantityCaptions(set)).toEqual(
                    allCaptions(INTERNET_5_CAPTION),
                );
                expect(forkpCaptions(set)).toEqual(
                    allCaptions(INTERNET_5_CAPTION),
                );
            }
        });

        it('заполненные подписи остаются как есть', async () => {
            const { enricher } = build();
            const supply = supplyDto('internet_5', 5);
            const captions = {
                quantityForKp: 'Подпись из конструктора',
                forkp: 'Поставка из конструктора',
            };
            const sets = {
                general: [fullSet(1, supply, captions)],
                alternative: [],
            };

            const result = await enricher.enrichSets(sets);

            expect(quantityCaptions(result.general[0])).toEqual(
                allCaptions('Подпись из конструктора'),
            );
            expect(forkpCaptions(result.general[0])).toEqual(
                allCaptions('Поставка из конструктора'),
            );
        });

        it('остальные поля набора и строк сохраняются', async () => {
            const { enricher } = build();
            const sets = {
                general: [fullSet(7, supplyDto('internet_5', 5))],
                alternative: [],
            };

            const result = await enricher.enrichSets(sets);

            expect(result.general[0].id).toBe(7);
            expect(result.general[0].show).toBe(true);
            expect(result.general[0].rows.garant?.[0].name).toBe('Гарант 7');
            expect(result.general[0].total[0].name).toBe('Итого 7');
        });

        it('отсутствующий ключ набора остаётся отсутствующим', async () => {
            const { enricher } = build();
            const rows: ProductRowSetItemDto = {
                garant: [captionRow('Гарант', supplyDto('internet_5', 5))],
            };
            const set = Object.assign(new ProductRowSetDto(), {
                id: 1,
                show: true,
                rows,
                total: [],
            });

            const result = await enricher.enrichSets({
                general: [set],
                alternative: [],
            });

            const enriched = result.general[0];
            expect(Object.keys(enriched.rows)).toEqual(['garant']);
            expect(quantityOf(enriched.rows.garant)).toBe(INTERNET_5_CAPTION);
            expect(enriched.total).toEqual([]);
        });

        it('null у ключа набора, у строк набора, у списка наборов и у самих наборов не роняет метод', async () => {
            const { enricher } = build();
            const nullKey = Object.assign(new ProductRowSetDto(), {
                id: 1,
                show: true,
                rows: Object.assign(new ProductRowSetItemDto(), {
                    garant: [captionRow('Гарант', supplyDto('internet_5', 5))],
                    consalting: null,
                }),
                total: [],
            });
            const nullRows = Object.assign(new ProductRowSetDto(), {
                id: 2,
                show: true,
                rows: null,
                total: [],
            });

            const result = await enricher.enrichSets({
                general: [nullKey, nullRows],
                alternative: null,
            });

            expect(result).toMatchObject({
                general: [
                    {
                        rows: {
                            garant: [
                                {
                                    product: {
                                        quantityForKp: INTERNET_5_CAPTION,
                                    },
                                },
                            ],
                            consalting: null,
                        },
                    },
                    { id: 2, rows: null },
                ],
                alternative: null,
            });
            expect(await enricher.enrichSets(null)).toBeNull();
            expect(await enricher.enrichSets(undefined)).toBeUndefined();
            expect(await enricher.enrichSets({})).toEqual({
                general: undefined,
                alternative: undefined,
            });
        });

        it('пришедший запрос не меняется', async () => {
            const { enricher } = build();
            const supply = supplyDto('internet_5', 5);
            const sets = {
                general: [fullSet(1, supply)],
                alternative: [fullSet(2, supply)],
            };
            const before = structuredClone(sets);

            await enricher.enrichSets(sets);

            expect(sets).toEqual(before);
        });

        it('поставка читается из справочника один раз на все наборы, чтения идут по одному', async () => {
            const { enricher, repository } = build();
            const internet5 = supplyDto('internet_5', 5);
            const sets = {
                general: [fullSet(1, internet5), fullSet(2, internet5)],
                alternative: [
                    fullSet(3, internet5),
                    fullSet(4, supplyDto('internet_10', 10)),
                ],
            };

            const result = await enricher.enrichSets(sets);

            // три набора на internet_5 и один на internet_10: 28 строк, 2 чтения
            expect(repository.byCodeCalls).toBe(2);
            expect(repository.maxInFlight).toBe(1);
            expect(quantityOf(result.alternative[1].rows.garant)).toBe(
                INTERNET_10_CAPTION,
            );
        });

        it('X-ОД читает справочник один раз на все строки', async () => {
            const { enricher, repository } = build();
            const custom = supplyDto('x_internet_7', 7);
            const sets = {
                general: [fullSet(1, custom), fullSet(2, custom)],
                alternative: [],
            };

            const result = await enricher.enrichSets(sets);

            expect(repository.manyCalls).toBe(1);
            expect(repository.maxInFlight).toBe(1);
            expect(quantityCaptions(result.general[1])).toEqual(
                allCaptions(INTERNET_7_CAPTION),
            );
        });
    });

    describe('enrichRows', () => {
        it('сорок строк с одной поставкой читают справочник один раз', async () => {
            const { enricher, repository } = build();
            const supply = supplyDto('internet_5', 5);
            const rows = Array.from({ length: 40 }, (_, index) =>
                captionRow(`Строка ${index}`, supply),
            );

            const result = await enricher.enrichRows(rows);

            expect(repository.totalCalls).toBe(1);
            expect(result.map(row => row.product.quantityForKp)).toEqual(
                Array.from({ length: 40 }, () => INTERNET_5_CAPTION),
            );
        });

        it('строки не делят одну поставку между собой', async () => {
            const { enricher } = build();
            const supply = supplyDto('internet_5', 5);

            const [first, second] = await enricher.enrichRows([
                captionRow('Первая', supply),
                captionRow('Вторая', supply),
            ]);

            expect(first.currentSupply).not.toBe(second.currentSupply);
            expect(first.currentSupply).toEqual(second.currentSupply);
        });
    });

    describe('enrichPayload', () => {
        it('дополняет поставку, строки, итог и наборы', async () => {
            const { enricher } = build();
            const supply = supplyDto('internet_5', 5);
            const payload = {
                domain: 'test.bitrix24.ru',
                supply,
                rows: [captionRow('Гарант', supply)],
                total: captionRow('Итого', supply),
                sets: {
                    general: [fullSet(1, supply)],
                    alternative: [fullSet(2, supply)],
                },
            };

            const result = await enricher.enrichPayload(payload);

            expect(result.domain).toBe('test.bitrix24.ru');
            expect(result.supply.quantityForKp).toBe(INTERNET_5_CAPTION);
            expect(quantityOf(result.rows)).toBe(INTERNET_5_CAPTION);
            expect(result.total.product.quantityForKp).toBe(INTERNET_5_CAPTION);
            expect(quantityCaptions(result.sets.general[0])).toEqual(
                allCaptions(INTERNET_5_CAPTION),
            );
            expect(quantityCaptions(result.sets.alternative[0])).toEqual(
                allCaptions(INTERNET_5_CAPTION),
            );
        });

        it('отсутствующие части не роняют метод', async () => {
            const { enricher, repository } = build();

            const payload: SupplyCaptionPayload = { supply: null, total: null };

            const result = await enricher.enrichPayload(payload);

            expect(result.supply).toBeNull();
            expect(result.total).toBeNull();
            expect(result.rows).toBeUndefined();
            expect(result.sets).toBeUndefined();
            expect(repository.totalCalls).toBe(0);
        });

        it('общая память не даёт читать справочник повторно в следующем вызове', async () => {
            const { enricher, repository } = build();
            const memo: SupplyEnrichMemo = new Map();
            const supply = supplyDto('internet_5', 5);

            await enricher.enrichPayload(
                { rows: [captionRow('А', supply)] },
                memo,
            );
            await enricher.enrichPayload(
                { rows: [captionRow('Б', supply)] },
                memo,
            );

            expect(repository.byCodeCalls).toBe(1);
        });
    });
});
