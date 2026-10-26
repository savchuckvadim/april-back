import { Injectable, Logger } from '@nestjs/common';
import { PriceService } from '../../price/services/price.service';
import { PriceCreateType } from '../../price/types/price-from-excel.type';
import { ComplectService } from '../../complect/services/complect.service';
import { PackageService } from '../../package/services/package.service';
import {
    COMPLECT_NUMBER_TO_CODE,
    LT_PACKAGE_NUMBER_TO_CODE,
    STAR_PACKAGE_CODE,
    SUPPLY_NUMBER_TO_KEY,
    supplyCodeFromNumber,
} from '../lib/legacy-feed-codes';
import {
    emptyReport,
    FeedProfPriceRow,
    FeedStarRow,
    ImportSectionReport,
} from '../types/garant-feed.types';

/**
 * Импорт цен из Google-фида: prof-линейка (комплект × поставка × Москва/регионы)
 * и пакеты услуг (LT, СТАР). Номера фида превращаются в коды каталога —
 * фронт матчит цену по supply_code === supply.code и
 * garant_package_code === package.code. Upsert тем же ключом, что и
 * excel-пайплайн (PriceService.storeBy*), поэтому повторный импорт
 * обновляет существующие строки.
 */
@Injectable()
export class GarantFeedPriceImportService {
    private readonly logger = new Logger(GarantFeedPriceImportService.name);

    constructor(
        private readonly priceService: PriceService,
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
    ) {}

    async importProf(
        rows: FeedProfPriceRow[],
        dryRun: boolean,
    ): Promise<ImportSectionReport> {
        const report = emptyReport('profPrices');
        const knownComplects = await this.loadComplectCodes();

        for (const row of rows) {
            const key = `complect#${row.complectNumber}/supply#${String(row.supplyNumber)}/region#${String(row.region)}`;
            const complectCode = COMPLECT_NUMBER_TO_CODE[row.complectNumber];
            if (!complectCode) {
                report.skipped.push({
                    key,
                    reason: `неизвестный номер комплекта ${row.complectNumber}`,
                });
                continue;
            }
            if (!knownComplects.has(complectCode)) {
                report.skipped.push({
                    key,
                    reason: `комплект ${complectCode} не найден в БД`,
                });
                continue;
            }
            if (typeof row.supplyNumber !== 'number') {
                report.skipped.push({
                    key,
                    reason: 'строка без номера поставки (не prof-прайс)',
                });
                continue;
            }
            const supplyKey = SUPPLY_NUMBER_TO_KEY[row.supplyNumber];
            const supplyCode = supplyCodeFromNumber(row.supplyNumber);
            if (!supplyKey || !supplyCode) {
                report.skipped.push({
                    key,
                    reason: `неизвестный номер поставки ${row.supplyNumber}`,
                });
                continue;
            }
            const regionType = this.toRegionType(row.region);
            if (!regionType) {
                report.skipped.push({
                    key,
                    reason: `регион «${String(row.region)}» — не 0/1 (universal-строки не импортируются)`,
                });
                continue;
            }
            if (row.price <= 0) {
                report.skipped.push({
                    key,
                    reason: `цена ${row.price} — не положительная`,
                });
                continue;
            }

            const price: PriceCreateType = {
                code: `${complectCode}_${supplyCode}_${regionType}`,
                region_type: regionType,
                value: row.price,
                isSpecial: false,
                discount: null,
                complectCode,
                supplyCode,
                supplyType: supplyKey.type,
                supplyTypeCode: supplyKey.type === 'internet' ? '0' : '1',
                garantPackageCode: null,
            };
            await this.store(
                () => this.priceService.storeByComplect(price),
                () =>
                    this.priceService.findByUnique(
                        complectCode,
                        supplyCode,
                        regionType,
                    ),
                dryRun,
                report,
                key,
            );
        }

        this.logger.log(
            `Prof-цены: создано ${report.created}, обновлено ${report.updated}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    async importServices(
        ltRows: FeedProfPriceRow[],
        starRows: FeedStarRow[],
        dryRun: boolean,
    ): Promise<ImportSectionReport> {
        const report = emptyReport('servicePrices');

        for (const row of ltRows) {
            const key = `lt#${row.complectNumber}/region#${String(row.region)}`;
            const packageCode = LT_PACKAGE_NUMBER_TO_CODE[row.complectNumber];
            if (!packageCode) {
                report.skipped.push({
                    key,
                    reason: `LT-пакет с номером ${row.complectNumber} не входит в актуальную линейку`,
                });
                continue;
            }
            const regionType = this.toRegionType(row.region);
            if (!regionType || row.price <= 0) {
                report.skipped.push({
                    key,
                    reason: `регион «${String(row.region)}» или цена ${row.price} невалидны`,
                });
                continue;
            }
            await this.storePackagePrice(
                packageCode,
                regionType,
                row.price,
                dryRun,
                report,
                key,
            );
        }

        for (const row of starRows) {
            await this.storePackagePrice(
                STAR_PACKAGE_CODE,
                '1',
                row.msk,
                dryRun,
                report,
                `star/msk`,
            );
            await this.storePackagePrice(
                STAR_PACKAGE_CODE,
                '0',
                row.regions,
                dryRun,
                report,
                `star/regions`,
            );
        }

        this.logger.log(
            `Цены услуг: создано ${report.created}, обновлено ${report.updated}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    private async storePackagePrice(
        packageCode: string,
        regionType: '0' | '1',
        value: number,
        dryRun: boolean,
        report: ImportSectionReport,
        key: string,
    ): Promise<void> {
        if (value <= 0) {
            report.skipped.push({
                key,
                reason: `цена ${value} — не положительная`,
            });
            return;
        }
        const existing = await this.packageService.findByCode(packageCode);
        if (!existing) {
            report.skipped.push({
                key,
                reason: `пакет ${packageCode} не найден в БД — выполните сид пакетов`,
            });
            return;
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
            () => this.priceService.storeByPackage(price),
            () => this.priceService.findPackagePrice(packageCode, regionType),
            dryRun,
            report,
            key,
        );
    }

    /** Общий учёт create/update с поддержкой dryRun */
    private async store(
        write: () => Promise<unknown>,
        findExisting: () => Promise<unknown>,
        dryRun: boolean,
        report: ImportSectionReport,
        key: string,
    ): Promise<void> {
        try {
            const existing = await findExisting();
            if (!dryRun) {
                await write();
            }
            if (existing) {
                report.updated += 1;
            } else {
                report.created += 1;
            }
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

    private toRegionType(region: number | string): '0' | '1' | null {
        if (region === 0 || region === '0') return '0';
        if (region === 1 || region === '1') return '1';
        return null;
    }

    private async loadComplectCodes(): Promise<Set<string>> {
        const complects = (await this.complectService.findAll()) ?? [];
        return new Set(complects.map(complect => complect.code));
    }
}
