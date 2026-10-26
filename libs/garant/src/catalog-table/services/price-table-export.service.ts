import { Injectable } from '@nestjs/common';
import { PriceService } from '../../price/services/price.service';
import { ComplectService } from '../../complect/services/complect.service';
import { PackageService } from '../../package/services/package.service';
import { SupplyService } from '../../supply/services/api/supply.service';
import { ComplectProductTypeEnum } from '../../complect/types/complect.type';
import { PackageProductTypeEnum } from '../../package/types/package.type';
import { ExportSheet, writeWorkbook } from '../lib/sheet-writer';
import {
    PRICE_COLUMN_COMPLECT_CODE,
    PRICE_COLUMN_COMPLECT_NAME,
    PRICE_SHEETS,
    PRICE_SHEET_SERVICES,
    PRICE_SUPPLY_COLUMN_ORDER,
    SERVICE_COLUMNS,
    supplyColumnTitle,
} from '../lib/price-sheet.schema';

/**
 * Экспорт эталонной таблицы цен: текущее состояние БД в привычном
 * формате (строка — комплект, колонка — вид поставки, отдельные листы
 * для регионов и Москвы, лист услуг для пакетов LT/СТАР).
 * Этот же формат читает импорт — «скачал, поправил, загрузил».
 */
@Injectable()
export class PriceTableExportService {
    constructor(
        private readonly priceService: PriceService,
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
        private readonly supplyService: SupplyService,
    ) {}

    async export(): Promise<Buffer> {
        const [prices, complects, packages, supplies] = await Promise.all([
            this.priceService.findMany(),
            this.complectService.findAll(),
            this.packageService.findAll(),
            this.supplyService.findMany(),
        ]);

        // Колонки — только поставки, которые реально есть в справочнике,
        // в привычном порядке (интернет, затем проксима).
        const supplyCodes = new Set(
            (supplies ?? []).map(supply => supply.code),
        );
        const supplyColumns = PRICE_SUPPLY_COLUMN_ORDER.filter(code =>
            supplyCodes.has(code),
        );
        for (const supply of supplies ?? []) {
            if (!supplyColumns.includes(supply.code)) {
                supplyColumns.push(supply.code);
            }
        }

        // Prof-линейка: комплекты «гаранта» (услуги живут на листе services)
        const profComplects = (complects ?? []).filter(
            complect =>
                !complect.productType ||
                complect.productType === ComplectProductTypeEnum.GARANT,
        );

        const priceByKey = new Map<string, number>();
        for (const price of prices ?? []) {
            if (!price.complect_code || !price.supply_code) continue;
            priceByKey.set(
                `${price.region_type}|${price.complect_code}|${price.supply_code}`,
                price.value,
            );
        }

        const sheets: ExportSheet[] = PRICE_SHEETS.map(sheet => ({
            name: sheet.name,
            headers: [
                PRICE_COLUMN_COMPLECT_CODE,
                PRICE_COLUMN_COMPLECT_NAME,
                ...supplyColumns,
            ],
            widths: [20, 28, ...supplyColumns.map(() => 14)],
            note:
                `Цены, ${sheet.title}. Строка — комплект (ключ: ${PRICE_COLUMN_COMPLECT_CODE}), ` +
                'колонка — вид поставки. Пустая ячейка = цену не менять. ' +
                'Колонки Локальная, Флэш и Проксима 1 ОД — РАЗНЫЕ поставки, не дубли. ' +
                `Подписи поставок: ${supplyColumns
                    .map(code => `${code} — ${supplyColumnTitle(code)}`)
                    .join('; ')}`,
            rows: profComplects.map(complect => [
                complect.code,
                complect.name,
                ...supplyColumns.map(
                    supplyCode =>
                        priceByKey.get(
                            `${sheet.regionType}|${complect.code}|${supplyCode}`,
                        ) ?? null,
                ),
            ]),
        }));

        sheets.push(this.buildServicesSheet(prices ?? [], packages));

        return await writeWorkbook(sheets);
    }

    /** Лист услуг: пакеты с ценами (LT, СТАР); у консалтинга рабсы, не цены */
    private buildServicesSheet(
        prices: Array<{
            garant_package_code: string | null;
            region_type: string;
            value: number;
        }>,
        packages: Array<{ code: string; name: string; productType?: string }>,
    ): ExportSheet {
        const priced = packages.filter(
            item =>
                item.productType === PackageProductTypeEnum.LT ||
                item.productType === PackageProductTypeEnum.STAR,
        );
        const byKey = new Map<string, number>();
        for (const price of prices) {
            if (!price.garant_package_code) continue;
            byKey.set(
                `${price.region_type}|${price.garant_package_code}`,
                price.value,
            );
        }
        return {
            name: PRICE_SHEET_SERVICES,
            headers: SERVICE_COLUMNS,
            widths: [22, 40, 14, 14],
            note:
                'Цены пакетов услуг (LegalTech, СТАР): msk — Москва, regions — регионы. ' +
                'Консалтинг здесь не нужен: у него не цены, а рабсы — правятся карточкой пакета.',
            rows: priced.map(item => [
                item.code,
                item.name,
                byKey.get(`1|${item.code}`) ?? null,
                byKey.get(`0|${item.code}`) ?? null,
            ]),
        };
    }
}
