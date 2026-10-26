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
    CONSALTING_NUMBER_TO_CODE,
    COMPLECT_NUMBER_TO_CODE,
    LT_PACKAGE_NAMES,
    LT_PACKAGE_NUMBER_TO_CODE,
    STAR_PACKAGE_CODE,
    SUPPLY_NUMBER_TO_KEY,
    UNIVERSAL_COMPLECT_NUMBERS,
    supplyCodeFromNumber,
} from '../lib/legacy-feed-codes';
import {
    GarantFeed,
    ImportSectionReport,
    emptyReport,
} from '../types/garant-feed.types';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Сид редко меняющихся справочников каталога из легаси-карт и Google-фида.
 * Создаёт ТОЛЬКО отсутствующие записи (upsert не делается — существующие
 * строки выверены в админке и не перетираются):
 * - 19 поставок по легаси-сетке (коэффициенты и тексты договоров добираются
 *   в админке/через excel);
 * - универсальные комплекты с рабсами, вычисленными из фида
 *   (цена региона / рабс региона);
 * - пакеты услуг: LT-линейка, СТАР, консалтинг с рабсами из фида.
 */
@Injectable()
export class GarantFeedSeedService {
    private readonly logger = new Logger(GarantFeedSeedService.name);

    constructor(
        private readonly supplyService: SupplyService,
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
    ) {}

    async seedSupplies(dryRun: boolean): Promise<ImportSectionReport> {
        const report = emptyReport('seed:supplies');
        for (const [numberKey, supply] of Object.entries(
            SUPPLY_NUMBER_TO_KEY,
        )) {
            const code = supplyCodeFromNumber(Number(numberKey));
            if (!code) continue;
            const existing = await this.supplyService.findByCode(code);
            if (existing) continue;
            if (!dryRun) {
                const created = await this.supplyService.create({
                    code,
                    type: supply.type,
                    name: supply.name,
                    fullName: supply.name,
                    shortName: supply.name,
                    usersQuantity: supply.usersQuantity,
                    coefficient: 1,
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
            `Сид поставок: создано ${report.created}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    async seedUniversalComplects(
        feed: GarantFeed,
        dryRun: boolean,
    ): Promise<ImportSectionReport> {
        const report = emptyReport('seed:universalComplects');
        const absByComplect = this.universalAbsFromFeed(feed);

        for (const number of UNIVERSAL_COMPLECT_NUMBERS) {
            const code = COMPLECT_NUMBER_TO_CODE[number];
            const existing = await this.complectService.findByCode(code);
            if (existing) continue;

            const feedRow = feed.prices.universal.find(
                row => row.complectNumber === number,
            );
            const abs = absByComplect.get(number);
            if (!feedRow || abs === undefined) {
                report.skipped.push({
                    key: code,
                    reason: 'нет данных в фиде для вычисления рабса',
                });
                continue;
            }
            if (!dryRun) {
                const dto: CreateComplectDto = {
                    name: feedRow.complectName,
                    fullName: feedRow.complectName,
                    shortName: feedRow.complectName,
                    code,
                    type: ComplectTypeEnum.UNIVERSAL,
                    color: '',
                    weight: 0,
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
            `Сид универсальных комплектов: создано ${report.created}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    async seedServicePackages(
        feed: GarantFeed,
        dryRun: boolean,
    ): Promise<ImportSectionReport> {
        const report = emptyReport('seed:servicePackages');

        for (const [numberKey, code] of Object.entries(
            LT_PACKAGE_NUMBER_TO_CODE,
        )) {
            const feedRow = feed.prices.lt.find(
                row => row.complectNumber === Number(numberKey),
            );
            const name = feedRow?.complectName ?? LT_PACKAGE_NAMES[code];
            await this.createPackageIfMissing(
                {
                    code,
                    name,
                    number: Number(numberKey),
                    productType: PackageProductTypeEnum.LT,
                },
                dryRun,
                report,
            );
        }

        const star = feed.prices.star[0];
        await this.createPackageIfMissing(
            {
                code: STAR_PACKAGE_CODE,
                name: star?.name ?? 'СТАР',
                fullName: star?.fullName,
                number: 0,
                weight: star?.weight,
                productType: PackageProductTypeEnum.STAR,
            },
            dryRun,
            report,
        );

        for (const row of feed.consalting) {
            const code = CONSALTING_NUMBER_TO_CODE[row.id];
            if (!code) {
                report.skipped.push({
                    key: `consalting#${row.id}`,
                    reason: 'неизвестный номер консалтинг-продукта',
                });
                continue;
            }
            await this.createPackageIfMissing(
                {
                    code,
                    name: row.name,
                    fullName: row.title,
                    number: row.id,
                    abs: row.rabs,
                    productType: PackageProductTypeEnum.CONSALING,
                },
                dryRun,
                report,
            );
        }

        this.logger.log(
            `Сид пакетов услуг: создано ${report.created}, пропущено ${report.skipped.length}`,
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
        report: ImportSectionReport,
    ): Promise<void> {
        const existing = await this.packageService.findByCode(input.code);
        if (existing) return;
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

    /**
     * Рабс универсального комплекта = цена из фида / рабс региона этой строки.
     * Берётся первая строка комплекта, чей регион есть в фиде с abs > 0.
     */
    private universalAbsFromFeed(feed: GarantFeed): Map<number, number> {
        const regionAbs = new Map<string, number>(
            feed.regions
                .filter(region => region.abs > 0)
                .map(region => [region.name, region.abs]),
        );
        const result = new Map<number, number>();
        for (const row of feed.prices.universal) {
            if (result.has(row.complectNumber)) continue;
            if (typeof row.region !== 'string') continue;
            const abs = regionAbs.get(row.region);
            if (!abs || row.price <= 0) continue;
            result.set(row.complectNumber, round2(row.price / abs));
        }
        return result;
    }
}
