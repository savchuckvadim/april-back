import { Injectable, Logger } from '@nestjs/common';
import { SupplyService } from '../../supply/services/api/supply.service';
import { ComplectService } from '../../complect/services/complect.service';
import { PackageService } from '../../package/services/package.service';
import { CreateComplectDto } from '../../complect/dto/create-complect.dto';
import { PackageCreateDto } from '../../package/dto/package-create.dto';
import {
    ComplectProductTypeEnum,
    ComplectTypeEnum,
} from '../../complect/types/complect.type';
import {
    PackageProductTypeEnum,
    PackageTypeEnum,
} from '../../package/types/package.type';
import {
    CONSALTING_PACKAGES,
    COMPLECT_NUMBER_TO_CODE,
    LT_PACKAGE_NAMES,
    LT_PACKAGE_NUMBER_TO_CODE,
    STAR_PACKAGE_CODE,
    STAR_PACKAGE_FULL_NAME,
    STAR_PACKAGE_NAME,
    LT_PACKAGE_WEIGHTS,
    STAR_PACKAGE_WEIGHT,
    SUPPLY_COEFFICIENTS,
    SUPPLY_NUMBER_TO_KEY,
    UNIVERSAL_COMPLECT_ABS,
    UNIVERSAL_COMPLECT_NAMES,
    UNIVERSAL_COMPLECT_NUMBERS,
    UNIVERSAL_COMPLECT_WEIGHTS,
    supplyCodeFromNumber,
} from '../lib/catalog-codes';
import {
    TableImportReport,
    emptyTableReport,
} from '../../catalog-table/types/table-import-report.type';

/**
 * Сид чистого каталога из константами заданной сетки (внешних источников
 * нет — цены и тексты заливаются эталонными таблицами в админке).
 * Создаёт ТОЛЬКО отсутствующие записи: существующие выверены вручную
 * и не перетираются.
 */
@Injectable()
export class CatalogSeedService {
    private readonly logger = new Logger(CatalogSeedService.name);

    constructor(
        private readonly supplyService: SupplyService,
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
    ) {}

    /** Сетка видов поставок: коды, типы, число ОД (коэффициенты — таблицей) */
    async seedSupplies(dryRun: boolean): Promise<TableImportReport> {
        const report = emptyTableReport('seed:supplies');
        for (const [numberKey, supply] of Object.entries(
            SUPPLY_NUMBER_TO_KEY,
        )) {
            const code = supplyCodeFromNumber(Number(numberKey));
            if (!code) continue;
            const existing = await this.supplyService.findByCode(code);
            if (existing) {
                report.unchanged += 1;
                continue;
            }
            if (!dryRun) {
                const created = await this.supplyService.create({
                    code,
                    type: supply.type,
                    name: supply.name,
                    fullName: supply.name,
                    shortName: supply.name,
                    usersQuantity: supply.usersQuantity,
                    coefficient: SUPPLY_COEFFICIENTS[Number(numberKey)] ?? 1,
                });
                if (!created) {
                    report.skipped.push({
                        key: code,
                        reason: 'ошибка создания поставки',
                    });
                    continue;
                }
            }
            report.created += 1;
        }
        this.logger.log(
            `Сид поставок: создано ${report.created}, уже было ${report.unchanged}`,
        );
        return report;
    }

    /** Универсальная линейка: карточки с рабсами (составы — точечно) */
    async seedUniversalComplects(dryRun: boolean): Promise<TableImportReport> {
        const report = emptyTableReport('seed:universalComplects');

        for (const number of UNIVERSAL_COMPLECT_NUMBERS) {
            const code = COMPLECT_NUMBER_TO_CODE[number];
            const existing = await this.complectService.findByCode(code);
            if (existing) {
                report.unchanged += 1;
                continue;
            }
            const name = UNIVERSAL_COMPLECT_NAMES[number];
            const abs = UNIVERSAL_COMPLECT_ABS[number];
            if (!name || abs === undefined) {
                report.skipped.push({
                    key: code,
                    reason: 'нет константы имени или рабса для комплекта',
                });
                continue;
            }
            if (!dryRun) {
                const dto: CreateComplectDto = {
                    name,
                    fullName: name,
                    shortName: name,
                    code,
                    type: ComplectTypeEnum.UNIVERSAL,
                    color: '',
                    weight: UNIVERSAL_COMPLECT_WEIGHTS[number] ?? 0,
                    abs: String(abs),
                    number,
                    productType: ComplectProductTypeEnum.GARANT,
                    withABS: true,
                    withConsalting: false,
                    withServices: false,
                    withLt: false,
                    isChanging: false,
                    withDefault: false,
                    infoblockIds: [],
                };
                const created = await this.complectService.create(dto);
                if (!created) {
                    report.skipped.push({
                        key: code,
                        reason: 'ошибка создания комплекта',
                    });
                    continue;
                }
            }
            report.created += 1;
        }
        this.logger.log(
            `Сид универсальных комплектов: создано ${report.created}, уже было ${report.unchanged}`,
        );
        return report;
    }

    /** Пакеты услуг: LT-линейка, СТАР (цены таблицей), консалтинг (рабсы) */
    async seedServicePackages(dryRun: boolean): Promise<TableImportReport> {
        const report = emptyTableReport('seed:servicePackages');

        for (const [numberKey, code] of Object.entries(
            LT_PACKAGE_NUMBER_TO_CODE,
        )) {
            await this.createPackageIfMissing(
                {
                    code,
                    name: LT_PACKAGE_NAMES[code] ?? code,
                    number: Number(numberKey),
                    weight: LT_PACKAGE_WEIGHTS[code],
                    productType: PackageProductTypeEnum.LT,
                },
                dryRun,
                report,
            );
        }

        await this.createPackageIfMissing(
            {
                code: STAR_PACKAGE_CODE,
                name: STAR_PACKAGE_NAME,
                fullName: STAR_PACKAGE_FULL_NAME,
                number: 0,
                weight: STAR_PACKAGE_WEIGHT,
                productType: PackageProductTypeEnum.STAR,
            },
            dryRun,
            report,
        );

        for (const item of CONSALTING_PACKAGES) {
            await this.createPackageIfMissing(
                {
                    code: item.code,
                    name: item.name,
                    fullName: item.fullName,
                    number: item.number,
                    abs: item.abs,
                    productType: PackageProductTypeEnum.CONSALING,
                },
                dryRun,
                report,
            );
        }

        this.logger.log(
            `Сид пакетов услуг: создано ${report.created}, уже было ${report.unchanged}`,
        );
        return report;
    }

    private async createPackageIfMissing(
        input: {
            code: string;
            name: string;
            fullName?: string;
            number: number;
            weight?: number;
            abs?: number;
            productType: PackageProductTypeEnum;
        },
        dryRun: boolean,
        report: TableImportReport,
    ): Promise<void> {
        const existing = await this.packageService.findByCode(input.code);
        if (existing) {
            report.unchanged += 1;
            return;
        }
        if (!dryRun) {
            const dto: PackageCreateDto = {
                code: input.code,
                name: input.name,
                fullName: input.fullName ?? input.name,
                shortName: input.name,
                type: PackageTypeEnum.PROF,
                number: input.number,
                weight: input.weight,
                abs: input.abs,
                productType: input.productType,
                withABS: input.abs !== undefined,
                isChanging: false,
                withDefault: false,
            };
            try {
                await this.packageService.create(dto);
            } catch (error) {
                report.skipped.push({
                    key: input.code,
                    reason:
                        error instanceof Error
                            ? error.message
                            : 'ошибка создания пакета',
                });
                return;
            }
        }
        report.created += 1;
    }
}
