import { Injectable, Logger } from '@nestjs/common';
import { PriceService } from '../../price/services/price.service';
import { PriceCreateType } from '../../price/types/price-from-excel.type';
import { ComplectService } from '../../complect/services/complect.service';
import { PackageService } from '../../package/services/package.service';
import { SupplyService } from '../../supply/services/api/supply.service';
import { SupplyEntity } from '../../supply/supply.entity';
import {
    TableImportReport,
    emptyTableReport,
} from '../types/table-import-report.type';
import { SheetTable, readSheet, readWorkbook } from '../lib/sheet-reader';
import {
    PRICE_COLUMN_COMPLECT_CODE,
    PRICE_KEY_COLUMNS,
    PRICE_SHEETS,
    PRICE_SHEET_SERVICES,
    SERVICE_COLUMN_MSK,
    SERVICE_COLUMN_PACKAGE_CODE,
    SERVICE_COLUMN_REGIONS,
} from '../lib/price-sheet.schema';

/**
 * Импорт эталонной таблицы цен. Ключ upsert — коды (как их матчит фронт
 * конструктора): prof — (complect_code, supply_code, region_type),
 * пакеты — (garant_package_code, region_type).
 *
 * Пустая ячейка значит «не менять», а не «обнулить»: удаление цен —
 * точечная операция в админке. Неизвестные коды и нечисловые значения
 * попадают в отчёт с причиной, а не портят каталог.
 */
@Injectable()
export class PriceTableImportService {
    private readonly logger = new Logger(PriceTableImportService.name);

    constructor(
        private readonly priceService: PriceService,
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
        private readonly supplyService: SupplyService,
    ) {}

    async import(
        buffer: Buffer,
        dryRun: boolean,
    ): Promise<TableImportReport[]> {
        const workbook = await readWorkbook(buffer);
        const [complects, supplies, packages] = await Promise.all([
            this.complectService.findAll(),
            this.supplyService.findMany(),
            this.packageService.findAll(),
        ]);
        const complectCodes = new Set(
            (complects ?? []).map(complect => complect.code),
        );
        const supplyByCode = new Map<string, SupplyEntity>(
            (supplies ?? []).map(supply => [supply.code, supply]),
        );
        const packageCodes = new Set(packages.map(item => item.code));

        const reports: TableImportReport[] = [];
        for (const sheetInfo of PRICE_SHEETS) {
            const sheet = readSheet(workbook, sheetInfo.name);
            sheet.requireColumns([PRICE_COLUMN_COMPLECT_CODE]);
            reports.push(
                await this.importProfSheet(
                    sheet,
                    sheetInfo.regionType,
                    complectCodes,
                    supplyByCode,
                    dryRun,
                ),
            );
        }

        const servicesSheet = readSheet(workbook, PRICE_SHEET_SERVICES);
        servicesSheet.requireColumns([SERVICE_COLUMN_PACKAGE_CODE]);
        reports.push(
            await this.importServicesSheet(servicesSheet, packageCodes, dryRun),
        );

        return reports;
    }

    /** Матричный лист: строка — комплект, колонка — код поставки */
    private async importProfSheet(
        sheet: SheetTable,
        regionType: '0' | '1',
        complectCodes: Set<string>,
        supplyByCode: Map<string, SupplyEntity>,
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const report = emptyTableReport(sheet.name);

        for (const row of sheet.rows) {
            const complectCode = row.string(PRICE_COLUMN_COMPLECT_CODE);
            if (complectCode === '') {
                report.skipped.push({
                    key: `строка ${row.rowNumber}`,
                    reason: `пустой ${PRICE_COLUMN_COMPLECT_CODE}`,
                });
                continue;
            }
            if (!complectCodes.has(complectCode)) {
                report.skipped.push({
                    key: complectCode,
                    reason: 'комплект с таким кодом не найден в каталоге',
                });
                continue;
            }

            for (const supplyCode of row.columnsExcept(PRICE_KEY_COLUMNS)) {
                const key = `${complectCode}/${supplyCode}`;
                const raw = row.nullableString(supplyCode);
                if (raw === null) continue; // пустая ячейка — не менять

                const supply = supplyByCode.get(supplyCode);
                if (!supply) {
                    report.skipped.push({
                        key,
                        reason: `вид поставки «${supplyCode}» не найден в справочнике`,
                    });
                    continue;
                }
                const value = row.number(supplyCode);
                if (value === null) {
                    report.skipped.push({
                        key,
                        reason: `значение «${raw}» не похоже на цену`,
                    });
                    continue;
                }
                if (value <= 0) {
                    report.skipped.push({
                        key,
                        reason: `цена ${value} — не положительная`,
                    });
                    continue;
                }

                const supplyType =
                    supply.type === 'proxima' ? 'proxima' : 'internet';
                const price: PriceCreateType = {
                    code: `${complectCode}_${supplyCode}_${regionType}`,
                    region_type: regionType,
                    value,
                    isSpecial: false,
                    discount: null,
                    complectCode,
                    supplyCode,
                    supplyType,
                    supplyTypeCode: supplyType === 'internet' ? '0' : '1',
                    garantPackageCode: null,
                };
                await this.store(
                    report,
                    key,
                    value,
                    () =>
                        this.priceService.findByUnique(
                            complectCode,
                            supplyCode,
                            regionType,
                        ),
                    () => this.priceService.storeByComplect(price),
                    dryRun,
                );
            }
        }

        this.logger.log(
            `Цены ${sheet.name}: создано ${report.created}, обновлено ${report.updated}, ` +
                `без изменений ${report.unchanged}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    /** Лист услуг: пакет × (Москва, регионы) */
    private async importServicesSheet(
        sheet: SheetTable,
        packageCodes: Set<string>,
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const report = emptyTableReport(sheet.name);

        for (const row of sheet.rows) {
            const packageCode = row.string(SERVICE_COLUMN_PACKAGE_CODE);
            if (packageCode === '') {
                report.skipped.push({
                    key: `строка ${row.rowNumber}`,
                    reason: `пустой ${SERVICE_COLUMN_PACKAGE_CODE}`,
                });
                continue;
            }
            if (!packageCodes.has(packageCode)) {
                report.skipped.push({
                    key: packageCode,
                    reason: 'пакет с таким кодом не найден в каталоге',
                });
                continue;
            }

            for (const [column, regionType] of [
                [SERVICE_COLUMN_MSK, '1'],
                [SERVICE_COLUMN_REGIONS, '0'],
            ] as Array<[string, '0' | '1']>) {
                if (!row.has(column)) continue;
                const raw = row.nullableString(column);
                if (raw === null) continue;
                const key = `${packageCode}/${column}`;
                const value = row.number(column);
                if (value === null || value <= 0) {
                    report.skipped.push({
                        key,
                        reason: `значение «${raw}» не похоже на цену`,
                    });
                    continue;
                }
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
                await this.store(
                    report,
                    key,
                    value,
                    () =>
                        this.priceService.findPackagePrice(
                            packageCode,
                            regionType,
                        ),
                    () => this.priceService.storeByPackage(price),
                    dryRun,
                );
            }
        }

        this.logger.log(
            `Цены услуг: создано ${report.created}, обновлено ${report.updated}, ` +
                `без изменений ${report.unchanged}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    /**
     * Общий учёт created/updated/unchanged: повторная загрузка того же
     * файла не трогает БД и не раздувает updated.
     */
    private async store(
        report: TableImportReport,
        key: string,
        value: number,
        findExisting: () => Promise<{ value: number } | null>,
        write: () => Promise<unknown>,
        dryRun: boolean,
    ): Promise<void> {
        try {
            const existing = await findExisting();
            if (existing && existing.value === value) {
                report.unchanged += 1;
                return;
            }
            if (!dryRun) await write();
            if (existing) report.updated += 1;
            else report.created += 1;
        } catch (error) {
            report.skipped.push({
                key,
                reason:
                    error instanceof Error
                        ? error.message
                        : 'неизвестная ошибка записи',
            });
        }
    }
}
