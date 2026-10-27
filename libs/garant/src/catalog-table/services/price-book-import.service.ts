import { Injectable, Logger } from '@nestjs/common';
import { PriceService } from '../../price/services/price.service';
import { PriceCreateType } from '../../price/types/price-from-excel.type';
import { ComplectService } from '../../complect/services/complect.service';
import { PackageService } from '../../package/services/package.service';
import { SupplyService } from '../../supply/services/api/supply.service';
import { RegionService } from '../../region/region.service';
import { ComplectEntity } from '../../complect/complect.entity';
import { RegionEntity } from '../../region/region.entity';
import { SupplyEntity } from '../../supply/supply.entity';
import { ComplectTypeEnum } from '../../complect/types/complect.type';
import { PackageProductTypeEnum } from '../../package/types/package.type';
import {
    TableImportReport,
    emptyTableReport,
} from '../types/table-import-report.type';
import { hasSheet, readSheet, readWorkbook } from '../lib/sheet-reader';
import {
    CONSALTING_COLUMNS,
    PRICE_BOOK_SHEETS,
    PROF_COLUMNS,
    PROF_KEY_COLUMNS,
    REGION_COLUMNS,
    SERVICE_COLUMNS,
    UNIVERSAL_COLUMNS,
    parseOdHeader,
} from '../lib/price-book.schema';
import { suppliesForOd } from '../lib/prof-price-expand';

/** НДС-множитель: рабс с НДС считает бэк */
const DEFAULT_TAX = 1.2;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Загрузка книги цен в формате рабочего файла владельца.
 * Одно действие обновляет всё: рабсы регионов, веса и АБС универсальной
 * линейки, прайс PROF по числу ОД, цены пакетов услуг и АБС консалтинга.
 *
 * Цены вычисляемых продуктов (универсальная линейка, консалтинг) в
 * прайс-таблицу не пишутся вообще — для них нужны только АБС и рабс.
 */
@Injectable()
export class PriceBookImportService {
    private readonly logger = new Logger(PriceBookImportService.name);

    constructor(
        private readonly priceService: PriceService,
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
        private readonly supplyService: SupplyService,
        private readonly regionService: RegionService,
    ) {}

    async import(
        buffer: Buffer,
        dryRun: boolean,
    ): Promise<TableImportReport[]> {
        const workbook = await readWorkbook(buffer);
        const reports: TableImportReport[] = [];

        if (hasSheet(workbook, PRICE_BOOK_SHEETS.regions)) {
            reports.push(await this.importRegions(workbook, dryRun));
        }
        if (hasSheet(workbook, PRICE_BOOK_SHEETS.universalWeights)) {
            reports.push(await this.importUniversal(workbook, dryRun));
        }

        const supplies = (await this.supplyService.findMany()) ?? [];
        const complects = (await this.complectService.findAll()) ?? [];
        for (const [sheetName, regionType] of [
            [PRICE_BOOK_SHEETS.profMsk, '1'],
            [PRICE_BOOK_SHEETS.profRegions, '0'],
        ] as Array<[string, '0' | '1']>) {
            if (!hasSheet(workbook, sheetName)) continue;
            reports.push(
                await this.importProf(
                    workbook,
                    sheetName,
                    regionType,
                    complects,
                    supplies,
                    dryRun,
                ),
            );
        }

        for (const [sheetName, productType] of [
            [PRICE_BOOK_SHEETS.lt, PackageProductTypeEnum.LT],
            [PRICE_BOOK_SHEETS.star, PackageProductTypeEnum.STAR],
        ] as Array<[string, PackageProductTypeEnum]>) {
            if (!hasSheet(workbook, sheetName)) continue;
            reports.push(
                await this.importServices(
                    workbook,
                    sheetName,
                    productType,
                    dryRun,
                ),
            );
        }

        if (hasSheet(workbook, PRICE_BOOK_SHEETS.consalting)) {
            reports.push(await this.importConsalting(workbook, dryRun));
        }

        if (reports.length === 0) {
            throw new Error(
                'В файле нет ни одного известного листа. Скачайте таблицу цен и правьте её, ' +
                    `не меняя имена листов (${Object.values(PRICE_BOOK_SHEETS).join(', ')}).`,
            );
        }
        return reports;
    }

    /** Лист regions: рабс региона (ключ — код в колонке name) */
    private async importRegions(
        workbook: Awaited<ReturnType<typeof readWorkbook>>,
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const sheet = readSheet(workbook, PRICE_BOOK_SHEETS.regions);
        sheet.requireColumns([REGION_COLUMNS.code]);
        const report = emptyTableReport(PRICE_BOOK_SHEETS.regions);
        const existing = (await this.regionService.findAll()) ?? [];
        const byCode = new Map<string, RegionEntity>(
            existing.map(region => [region.code, region]),
        );

        for (const row of sheet.rows) {
            const code = row.string(REGION_COLUMNS.code);
            if (code === '') continue; // служебные строки без кода
            const current = byCode.get(code);
            if (!current) {
                report.skipped.push({
                    key: code,
                    reason: 'региона с таким кодом нет в системе — добавьте его в разделе «Регионы»',
                });
                continue;
            }
            const raw = row.nullableString(REGION_COLUMNS.rabs);
            if (raw === null) {
                report.unchanged += 1;
                continue;
            }
            const rabs = row.number(REGION_COLUMNS.rabs);
            if (rabs === null || rabs <= 0) {
                report.skipped.push({
                    key: code,
                    reason: `значение рабса «${raw}» не похоже на цену`,
                });
                continue;
            }
            const nextAbs = round2(rabs);
            const tax = current.tax > 0 ? current.tax : DEFAULT_TAX;
            const nextTaxAbs = round2(nextAbs * tax);
            if (current.abs === nextAbs && current.tax_abs === nextTaxAbs) {
                report.unchanged += 1;
                continue;
            }
            if (!dryRun) {
                const updated = await this.regionService.update({
                    id: current.id,
                    abs: nextAbs,
                    tax,
                    tax_abs: nextTaxAbs,
                });
                if (!updated) {
                    report.skipped.push({
                        key: code,
                        reason: 'не удалось сохранить рабс региона',
                    });
                    continue;
                }
            }
            report.updated += 1;
        }
        this.log(report);
        return report;
    }

    /** Лист universal-weights: вес и АБС комплекта (цен нет) */
    private async importUniversal(
        workbook: Awaited<ReturnType<typeof readWorkbook>>,
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const sheet = readSheet(workbook, PRICE_BOOK_SHEETS.universalWeights);
        sheet.requireColumns([UNIVERSAL_COLUMNS.name]);
        const report = emptyTableReport(PRICE_BOOK_SHEETS.universalWeights);
        const universal = ((await this.complectService.findAll()) ?? []).filter(
            complect => complect.type === ComplectTypeEnum.UNIVERSAL,
        );
        const byName = new Map<string, ComplectEntity>(
            universal.map(complect => [complect.name.toLowerCase(), complect]),
        );

        for (const row of sheet.rows) {
            const name = row.string(UNIVERSAL_COLUMNS.name);
            if (name === '') continue;
            const current = byName.get(name.toLowerCase());
            if (!current) {
                report.skipped.push({
                    key: name,
                    reason: 'комплекта с таким названием нет в универсальной линейке',
                });
                continue;
            }
            const weight = row.has(UNIVERSAL_COLUMNS.weight)
                ? row.number(UNIVERSAL_COLUMNS.weight)
                : null;
            const abs = row.has(UNIVERSAL_COLUMNS.abs)
                ? row.number(UNIVERSAL_COLUMNS.abs)
                : null;
            if (weight === null && abs === null) {
                report.unchanged += 1;
                continue;
            }
            const nextWeight = weight ?? current.weight;
            const nextAbs = abs === null ? current.abs : String(abs);
            if (
                nextWeight === current.weight &&
                (nextAbs ?? null) === (current.abs ?? null)
            ) {
                report.unchanged += 1;
                continue;
            }
            if (!dryRun) {
                const updated = await this.complectService.update(current.id, {
                    ...this.complectToDto(current),
                    weight: nextWeight,
                    abs: nextAbs,
                });
                if (!updated) {
                    report.skipped.push({
                        key: name,
                        reason: 'не удалось сохранить вес или АБС комплекта',
                    });
                    continue;
                }
            }
            report.updated += 1;
        }
        this.log(report);
        return report;
    }

    /** Листы prof-prices-*: строка — комплект, колонка — число ОД */
    private async importProf(
        workbook: Awaited<ReturnType<typeof readWorkbook>>,
        sheetName: string,
        regionType: '0' | '1',
        complects: readonly ComplectEntity[],
        supplies: readonly SupplyEntity[],
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const sheet = readSheet(workbook, sheetName);
        sheet.requireColumns([PROF_COLUMNS.complectCode]);
        const report = emptyTableReport(sheetName);
        const profCodes = new Set(
            complects
                .filter(complect => complect.type === ComplectTypeEnum.PROF)
                .map(complect => complect.code),
        );
        const universalCodes = new Set(
            complects
                .filter(
                    complect => complect.type === ComplectTypeEnum.UNIVERSAL,
                )
                .map(complect => complect.code),
        );

        for (const row of sheet.rows) {
            const complectCode = row.string(PROF_COLUMNS.complectCode);
            if (complectCode === '') continue;
            if (universalCodes.has(complectCode)) {
                report.skipped.push({
                    key: complectCode,
                    reason:
                        'это комплект универсальной линейки — его цена считается от АБС и рабса региона, ' +
                        'в прайсе ей не место',
                });
                continue;
            }
            if (!profCodes.has(complectCode)) {
                report.skipped.push({
                    key: complectCode,
                    reason: 'комплекта с таким кодом нет среди PROF-комплектов',
                });
                continue;
            }

            for (const header of row.columnsExcept(PROF_KEY_COLUMNS)) {
                const usersQuantity = parseOdHeader(header);
                if (usersQuantity === null) continue; // не ОД-колонка
                const raw = row.nullableString(header);
                if (raw === null) continue; // пустая ячейка — не менять

                const key = `${complectCode}/${header}`;
                const value = row.number(header);
                if (value === null || value <= 0) {
                    report.skipped.push({
                        key,
                        reason: `значение «${raw}» не похоже на цену`,
                    });
                    continue;
                }
                const targets = suppliesForOd(supplies, usersQuantity);
                if (targets.length === 0) {
                    report.skipped.push({
                        key,
                        reason: `нет видов поставки на ${usersQuantity} ОД — добавьте их в разделе «Виды поставок»`,
                    });
                    continue;
                }
                for (const supply of targets) {
                    await this.storeProfPrice(
                        report,
                        `${complectCode}/${supply.code}`,
                        complectCode,
                        supply,
                        regionType,
                        value,
                        dryRun,
                    );
                }
            }
        }
        this.log(report);
        return report;
    }

    private async storeProfPrice(
        report: TableImportReport,
        key: string,
        complectCode: string,
        supply: { code: string; type: string },
        regionType: '0' | '1',
        value: number,
        dryRun: boolean,
    ): Promise<void> {
        const supplyType = supply.type === 'proxima' ? 'proxima' : 'internet';
        const price: PriceCreateType = {
            code: `${complectCode}_${supply.code}_${regionType}`,
            region_type: regionType,
            value,
            isSpecial: false,
            discount: null,
            complectCode,
            supplyCode: supply.code,
            supplyType,
            supplyTypeCode: supplyType === 'internet' ? '0' : '1',
            garantPackageCode: null,
        };
        try {
            const existing = await this.priceService.findByUnique(
                complectCode,
                supply.code,
                regionType,
            );
            if (existing && existing.value === value) {
                report.unchanged += 1;
                return;
            }
            if (!dryRun) await this.priceService.storeByComplect(price);
            if (existing) report.updated += 1;
            else report.created += 1;
        } catch (error) {
            report.skipped.push({
                key,
                reason:
                    error instanceof Error
                        ? error.message
                        : 'не удалось сохранить цену',
            });
        }
    }

    /** Листы lt и star: вес пакета и цены Москва/регионы */
    private async importServices(
        workbook: Awaited<ReturnType<typeof readWorkbook>>,
        sheetName: string,
        productType: PackageProductTypeEnum,
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const sheet = readSheet(workbook, sheetName);
        sheet.requireColumns([SERVICE_COLUMNS.code]);
        const report = emptyTableReport(sheetName);
        const packages = await this.packageService.findAll();
        const byCode = new Map(packages.map(item => [item.code, item]));

        for (const row of sheet.rows) {
            const code = row.string(SERVICE_COLUMNS.code);
            if (code === '') continue;
            const current = byCode.get(code);
            if (!current) {
                report.skipped.push({
                    key: code,
                    reason: 'пакета с таким кодом нет в системе — добавьте его в разделе «Пакеты»',
                });
                continue;
            }
            if (current.productType !== productType) {
                report.skipped.push({
                    key: code,
                    reason: `пакет «${current.name}» относится к другому виду продукта`,
                });
                continue;
            }

            // Вес пакета
            const weight = row.has(SERVICE_COLUMNS.weight)
                ? row.number(SERVICE_COLUMNS.weight)
                : null;
            if (weight !== null && weight !== current.weight) {
                if (!dryRun) {
                    try {
                        await this.packageService.update(String(current.id), {
                            weight,
                        });
                    } catch (error) {
                        report.skipped.push({
                            key: `${code}/вес`,
                            reason:
                                error instanceof Error
                                    ? error.message
                                    : 'не удалось сохранить вес пакета',
                        });
                    }
                }
                report.updated += 1;
            }

            // Цены Москва и регионы
            for (const [column, regionType] of [
                [SERVICE_COLUMNS.msk, '1'],
                [SERVICE_COLUMNS.regions, '0'],
            ] as Array<[string, '0' | '1']>) {
                if (!row.has(column)) continue;
                const raw = row.nullableString(column);
                if (raw === null) continue;
                const key = `${code}/${column}`;
                const value = row.number(column);
                if (value === null || value <= 0) {
                    report.skipped.push({
                        key,
                        reason: `значение «${raw}» не похоже на цену`,
                    });
                    continue;
                }
                await this.storePackagePrice(
                    report,
                    key,
                    code,
                    regionType,
                    value,
                    dryRun,
                );
            }
        }
        this.log(report);
        return report;
    }

    private async storePackagePrice(
        report: TableImportReport,
        key: string,
        packageCode: string,
        regionType: '0' | '1',
        value: number,
        dryRun: boolean,
    ): Promise<void> {
        const price: PriceCreateType = {
            code: `${packageCode}_${regionType}`,
            region_type: regionType,
            value,
            isSpecial: false,
            discount: null,
            complectCode: null,
            supplyCode: null,
            supplyType: null,
            supplyTypeCode: null,
            garantPackageCode: packageCode,
        };
        try {
            const existing = await this.priceService.findPackagePrice(
                packageCode,
                regionType,
            );
            if (existing && existing.value === value) {
                report.unchanged += 1;
                return;
            }
            if (!dryRun) await this.priceService.storeByPackage(price);
            if (existing) report.updated += 1;
            else report.created += 1;
        } catch (error) {
            report.skipped.push({
                key,
                reason:
                    error instanceof Error
                        ? error.message
                        : 'не удалось сохранить цену',
            });
        }
    }

    /** Лист consalting: АБС продукта (цен нет) */
    private async importConsalting(
        workbook: Awaited<ReturnType<typeof readWorkbook>>,
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const sheet = readSheet(workbook, PRICE_BOOK_SHEETS.consalting);
        sheet.requireColumns([CONSALTING_COLUMNS.code]);
        const report = emptyTableReport(PRICE_BOOK_SHEETS.consalting);
        const packages = await this.packageService.findAll();
        const byCode = new Map(packages.map(item => [item.code, item]));

        for (const row of sheet.rows) {
            const code = row.string(CONSALTING_COLUMNS.code);
            if (code === '') continue;
            const current = byCode.get(code);
            if (!current) {
                report.skipped.push({
                    key: code,
                    reason: 'продукта с таким кодом нет в системе — добавьте его в разделе «Пакеты»',
                });
                continue;
            }
            if (!row.has(CONSALTING_COLUMNS.abs)) {
                report.unchanged += 1;
                continue;
            }
            const raw = row.nullableString(CONSALTING_COLUMNS.abs);
            if (raw === null) {
                report.unchanged += 1;
                continue;
            }
            const abs = row.number(CONSALTING_COLUMNS.abs);
            if (abs === null || abs < 0) {
                report.skipped.push({
                    key: code,
                    reason: `значение АБС «${raw}» не похоже на число`,
                });
                continue;
            }
            if (abs === current.abs) {
                report.unchanged += 1;
                continue;
            }
            if (!dryRun) {
                try {
                    await this.packageService.update(String(current.id), {
                        abs,
                    });
                } catch (error) {
                    report.skipped.push({
                        key: code,
                        reason:
                            error instanceof Error
                                ? error.message
                                : 'не удалось сохранить АБС',
                    });
                    continue;
                }
            }
            report.updated += 1;
        }
        this.log(report);
        return report;
    }

    /**
     * Полный DTO комплекта для update (сервис собирает сущность с нуля,
     * поэтому неизменённые поля переносятся из текущей записи; состав
     * инфоблоков сохраняется).
     */
    private complectToDto(current: ComplectEntity) {
        return {
            code: current.code,
            type: current.type,
            productType: current.productType,
            name: current.name,
            fullName: current.fullName,
            shortName: current.shortName,
            number: current.number,
            weight: current.weight,
            abs: current.abs,
            color: current.color,
            description: current.description,
            withABS: current.withABS,
            withConsalting: current.withConsalting,
            withServices: current.withServices,
            withLt: current.withLt,
            isChanging: current.isChanging,
            withDefault: current.withDefault,
            infoblockIds: (current.infoblocks ?? []).map(infoblock =>
                String(infoblock.id),
            ),
        };
    }

    private log(report: TableImportReport): void {
        this.logger.log(
            `${report.section}: создано ${report.created}, обновлено ${report.updated}, ` +
                `без изменений ${report.unchanged}, пропущено ${report.skipped.length}`,
        );
    }
}
