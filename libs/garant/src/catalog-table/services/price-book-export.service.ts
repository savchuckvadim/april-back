import { Injectable } from '@nestjs/common';
import { PriceService } from '../../price/services/price.service';
import { ComplectService } from '../../complect/services/complect.service';
import { PackageService } from '../../package/services/package.service';
import { SupplyService } from '../../supply/services/api/supply.service';
import { RegionService } from '../../region/region.service';
import { ComplectTypeEnum } from '../../complect/types/complect.type';
import { PackageProductTypeEnum } from '../../package/types/package.type';
import {
    ExportCellValue,
    ExportSheet,
    writeWorkbook,
} from '../lib/sheet-writer';
import {
    CONSALTING_COLUMNS,
    PRICE_BOOK_SHEETS,
    PROF_COLUMNS,
    REGION_COLUMNS,
    SERVICE_COLUMNS,
    UNIVERSAL_COLUMNS,
    odColumnHeader,
} from '../lib/price-book.schema';
import { odColumnsFromSupplies, odForSupply } from '../lib/prof-price-expand';
import {
    LT_PACKAGE_REFS,
    PackageRef,
    STAR_PACKAGE_REFS,
    UNIVERSAL_COMPLECT_REFS,
} from '../lib/catalog-row-resolve';
import { CONSALTING_PACKAGES } from '../../catalog-install/lib/catalog-codes';

/** Что положить в ячейки: текущие данные или пустой шаблон */
export type PriceBookMode = 'current' | 'blank';

/**
 * Выгрузка книги цен в формате рабочего файла владельца: 7 листов,
 * один файл на всё обновление цен. Режим `blank` отдаёт тот же файл
 * со строками-ключами, но пустыми значениями — чтобы вносить прайс
 * с нуля, не удаляя старые цифры руками.
 */
@Injectable()
export class PriceBookExportService {
    constructor(
        private readonly priceService: PriceService,
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
        private readonly supplyService: SupplyService,
        private readonly regionService: RegionService,
    ) {}

    async export(mode: PriceBookMode): Promise<Buffer> {
        const [prices, complects, packages, supplies, regions] =
            await Promise.all([
                this.priceService.findMany(),
                this.complectService.findAll(),
                this.packageService.findAll(),
                this.supplyService.findMany(),
                this.regionService.findAll(),
            ]);
        const blank = mode === 'blank';
        const value = (actual: ExportCellValue): ExportCellValue =>
            blank ? null : actual;

        const profComplects = (complects ?? []).filter(
            complect => complect.type === ComplectTypeEnum.PROF,
        );
        const universalComplects = (complects ?? []).filter(
            complect => complect.type === ComplectTypeEnum.UNIVERSAL,
        );
        const odColumns = odColumnsFromSupplies(supplies ?? []);
        // Чистая база: часть справочников ещё не заведена — предупреждаем
        // в файле, иначе пустые листы выглядят поломкой выгрузки.
        const emptyHints = this.emptyCatalogHints({
            supplies: (supplies ?? []).length,
            universal: universalComplects.length,
            prof: profComplects.length,
            packages: packages.length,
        });

        // Цены PROF: ключ «комплект|ОД|регион». Одна цена приходится на
        // несколько видов поставки с тем же числом ОД — берём любую.
        const profPrice = new Map<string, number>();
        const supplyByCode = new Map(
            (supplies ?? []).map(supply => [supply.code, supply]),
        );
        for (const price of prices ?? []) {
            if (!price.complect_code || !price.supply_code) continue;
            const supply = supplyByCode.get(price.supply_code);
            if (!supply) continue;
            profPrice.set(
                `${price.complect_code}|${odForSupply(supply)}|${price.region_type}`,
                price.value,
            );
        }

        const packagePrice = new Map<string, number>();
        for (const price of prices ?? []) {
            if (!price.garant_package_code) continue;
            packagePrice.set(
                `${price.garant_package_code}|${price.region_type}`,
                price.value,
            );
        }

        const sheets: ExportSheet[] = [
            {
                name: PRICE_BOOK_SHEETS.regions,
                headers: [
                    REGION_COLUMNS.id,
                    REGION_COLUMNS.title,
                    REGION_COLUMNS.rabs,
                    REGION_COLUMNS.code,
                    REGION_COLUMNS.infoblock,
                ],
                widths: [8, 32, 14, 14, 46],
                note:
                    'Рабсы регионов. Ключ — колонка «name» (код региона), меняется «rabs» — ' +
                    'стоимость одного рабса в рублях. От неё считается цена универсальной ' +
                    'линейки и консалтинга, поэтому рабсы важно держать актуальными. ' +
                    'Рабс с НДС система считает сама.',
                rows: [...(regions ?? [])]
                    .sort((a, b) => a.number - b.number)
                    .map((region): ExportCellValue[] => [
                        region.number,
                        region.title,
                        value(region.abs),
                        region.code,
                        region.infoblock,
                    ]),
            },
            {
                name: PRICE_BOOK_SHEETS.universalWeights,
                headers: [
                    UNIVERSAL_COLUMNS.name,
                    UNIVERSAL_COLUMNS.weight,
                    UNIVERSAL_COLUMNS.abs,
                    UNIVERSAL_COLUMNS.code,
                ],
                widths: [28, 10, 10, 18],
                note:
                    'Универсальная линейка: вес комплекта и его АБС. ЦЕН ЗДЕСЬ НЕТ и не нужно — ' +
                    'цена считается как АБС × рабс региона × коэффициент вида поставки. ' +
                    'Ключ строки — название комплекта, колонка «code» показывает, ' +
                    'под каким кодом комплект лежит в каталоге (менять не нужно).',
                // Линейки ещё нет — отдаём эталонные строки, чтобы файл
                // можно было заполнить и загрузить (импорт их создаст).
                rows:
                    universalComplects.length > 0
                        ? universalComplects
                              .sort((a, b) => a.number - b.number)
                              .map((complect): ExportCellValue[] => [
                                  complect.name,
                                  value(complect.weight),
                                  value(complect.abs ?? null),
                                  complect.code,
                              ])
                        : UNIVERSAL_COMPLECT_REFS.map(
                              (ref): ExportCellValue[] => [
                                  ref.name,
                                  value(ref.weight > 0 ? ref.weight : null),
                                  value(ref.abs),
                                  ref.code,
                              ],
                          ),
            },
            this.profSheet(
                PRICE_BOOK_SHEETS.profMsk,
                'Москва',
                '1',
                profComplects,
                odColumns,
                profPrice,
                blank,
            ),
            this.profSheet(
                PRICE_BOOK_SHEETS.profRegions,
                'регионы',
                '0',
                profComplects,
                odColumns,
                profPrice,
                blank,
            ),
            this.serviceSheet(
                PRICE_BOOK_SHEETS.lt,
                PackageProductTypeEnum.LT,
                'Пакеты ЛегалТех: вес пакета и цены для Москвы и регионов.',
                packages,
                LT_PACKAGE_REFS,
                packagePrice,
                blank,
            ),
            this.serviceSheet(
                PRICE_BOOK_SHEETS.star,
                PackageProductTypeEnum.STAR,
                'СТАР: вес и цены для Москвы и регионов.',
                packages,
                STAR_PACKAGE_REFS,
                packagePrice,
                blank,
            ),
            {
                name: PRICE_BOOK_SHEETS.consalting,
                headers: [
                    CONSALTING_COLUMNS.id,
                    CONSALTING_COLUMNS.name,
                    CONSALTING_COLUMNS.title,
                    CONSALTING_COLUMNS.description,
                    CONSALTING_COLUMNS.abs,
                    CONSALTING_COLUMNS.code,
                ],
                widths: [8, 26, 40, 30, 10, 18],
                note:
                    'Консалтинг: АБС продукта. ЦЕН ЗДЕСЬ НЕТ — цена считается от рабса региона, ' +
                    'как у универсальной линейки. Ключ строки — колонка «code».',
                rows: this.consaltingRows(packages, value),
            },
        ];

        if (emptyHints.length > 0) {
            sheets.unshift({
                name: 'сначала прочитайте',
                headers: ['что нужно сделать'],
                widths: [160],
                rows: emptyHints.map((hint): ExportCellValue[] => [hint]),
            });
        }

        return await writeWorkbook(sheets);
    }

    /**
     * Подсказки для чистой базы: какие справочники ещё не заведены и
     * почему соответствующие листы пришли пустыми.
     */
    private emptyCatalogHints(counts: {
        supplies: number;
        universal: number;
        prof: number;
        packages: number;
    }): string[] {
        const hints: string[] = [];
        if (counts.supplies === 0 || counts.universal === 0) {
            hints.push(
                'Каталог ещё пустой, поэтому часть строк в файле — заготовки: заполните в них ' +
                    'цены и рабсы и загрузите файл обратно. Загрузка сама создаст то, чего нет: ' +
                    'виды поставок, универсальные комплекты и пакеты услуг.',
            );
        }
        if (counts.supplies === 0) {
            hints.push(
                'Виды поставок ещё не заведены, колонки прайса показаны по стандартной сетке ' +
                    '(1, 2, 3, 5, 10, 20, 30, 50 ОД). Они появятся при загрузке файла с ценами.',
            );
        }
        if (counts.prof === 0) {
            hints.push(
                'Комплекты PROF ещё не заведены — прайс заполнять не на что. ' +
                    'Добавьте комплекты в разделе «Комплекты» или таблицей комплектов: ' +
                    'их состав (инфоблоки) загрузка цен не создаёт.',
            );
        }
        hints.push(
            'Названия и коды в заготовках менять не нужно: по ним система узнаёт строку. ' +
                'Меняйте только цифры — цены, рабсы и веса.',
        );
        return hints;
    }

    /**
     * Строки листа консалтинга: заведённые продукты, а если их ещё нет —
     * эталонные с рабсами (импорт создаст их по коду).
     */
    private consaltingRows(
        packages: ReadonlyArray<{
            code: string;
            name: string;
            fullName: string;
            number: number;
            description?: string | null;
            abs?: number;
            productType?: string;
        }>,
        value: (actual: ExportCellValue) => ExportCellValue,
    ): ExportCellValue[][] {
        const own = packages
            .filter(
                item => item.productType === PackageProductTypeEnum.CONSALING,
            )
            .slice()
            .sort((a, b) => a.number - b.number);
        if (own.length === 0) {
            return CONSALTING_PACKAGES.slice()
                .sort((a, b) => a.number - b.number)
                .map((ref): ExportCellValue[] => [
                    ref.number,
                    ref.name,
                    ref.fullName,
                    null,
                    value(ref.abs),
                    ref.code,
                ]);
        }
        return own.map((item): ExportCellValue[] => [
            item.number,
            item.name,
            item.fullName,
            item.description ?? null,
            value(item.abs ?? null),
            item.code,
        ]);
    }

    /** Лист PROF-прайса: строка — комплект, колонка — число ОД */
    private profSheet(
        name: string,
        scopeTitle: string,
        regionType: '0' | '1',
        complects: ReadonlyArray<{
            code: string;
            name: string;
            number: number;
        }>,
        odColumns: readonly number[],
        profPrice: Map<string, number>,
        blank: boolean,
    ): ExportSheet {
        return {
            name,
            headers: [
                PROF_COLUMNS.complectName,
                PROF_COLUMNS.complectNumber,
                PROF_COLUMNS.complectCode,
                ...odColumns.map(odColumnHeader),
            ],
            widths: [26, 10, 16, ...odColumns.map(() => 13)],
            note:
                `Прайс PROF, ${scopeTitle}. Строка — комплект (ключ: колонка «complectCode»), ` +
                'колонка — число одновременных доступов (ОД). Цены приходят прайсом ' +
                'от поставщика, система их не вычисляет. ' +
                'Одна цена действует на все способы доставки с этим числом ОД ' +
                '(Интернет и Проксима): они отличаются только способом, не ценой. ' +
                'Стандартная, Локальная и Флэш берут цену колонки «1 ОД». ' +
                'Пустая ячейка = цену не менять.',
            rows: complects
                .slice()
                .sort((a, b) => a.number - b.number)
                .map((complect): ExportCellValue[] => [
                    complect.name,
                    complect.number,
                    complect.code,
                    ...odColumns.map(od =>
                        blank
                            ? null
                            : (profPrice.get(
                                  `${complect.code}|${od}|${regionType}`,
                              ) ?? null),
                    ),
                ]),
        };
    }

    /** Лист пакета услуг: вес и цены Москва/регионы */
    private serviceSheet(
        name: string,
        productType: PackageProductTypeEnum,
        note: string,
        packages: ReadonlyArray<{
            code: string;
            name: string;
            number: number;
            weight?: number;
            productType?: string;
        }>,
        refs: readonly PackageRef[],
        packagePrice: Map<string, number>,
        blank: boolean,
    ): ExportSheet {
        return {
            name,
            headers: [
                SERVICE_COLUMNS.id,
                SERVICE_COLUMNS.name,
                SERVICE_COLUMNS.weight,
                SERVICE_COLUMNS.msk,
                SERVICE_COLUMNS.regions,
                SERVICE_COLUMNS.code,
            ],
            widths: [8, 30, 10, 13, 13, 20],
            note: `${note} Ключ строки — колонка «code». Пустая ячейка = не менять.`,
            rows: this.serviceRows(
                packages,
                productType,
                refs,
                packagePrice,
                blank,
            ),
        };
    }

    /**
     * Строки листа пакета: заведённые в каталоге, а если пакетов этого
     * вида ещё нет — эталонные (импорт создаст их по коду).
     */
    private serviceRows(
        packages: ReadonlyArray<{
            code: string;
            name: string;
            number: number;
            weight?: number;
            productType?: string;
        }>,
        productType: PackageProductTypeEnum,
        refs: readonly PackageRef[],
        packagePrice: Map<string, number>,
        blank: boolean,
    ): ExportCellValue[][] {
        const own = packages
            .filter(item => item.productType === productType)
            .slice()
            .sort((a, b) => a.number - b.number);
        if (own.length === 0) {
            return refs
                .slice()
                .sort((a, b) => a.number - b.number)
                .map((ref): ExportCellValue[] => [
                    ref.number,
                    ref.name,
                    blank ? null : (ref.weight ?? null),
                    null,
                    null,
                    ref.code,
                ]);
        }
        return own.map((item): ExportCellValue[] => [
            item.number,
            item.name,
            blank ? null : (item.weight ?? null),
            blank ? null : (packagePrice.get(`${item.code}|1`) ?? null),
            blank ? null : (packagePrice.get(`${item.code}|0`) ?? null),
            item.code,
        ]);
    }
}
