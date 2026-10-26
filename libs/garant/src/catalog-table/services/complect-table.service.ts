import { Injectable, Logger } from '@nestjs/common';
import { ComplectService } from '../../complect/services/complect.service';
import { PackageService } from '../../package/services/package.service';
import { ComplectEntity } from '../../complect/complect.entity';
import { CreateComplectDto } from '../../complect/dto/create-complect.dto';
import { PackageCreateDto } from '../../package/dto/package-create.dto';
import { PackageUpdateDto } from '../../package/dto/package-update.dto';
import {
    ComplectProductTypeEnum,
    ComplectTypeEnum,
} from '../../complect/types/complect.type';
import {
    PackageProductTypeEnum,
    PackageTypeEnum,
} from '../../package/types/package.type';
import { ExportCellValue, writeWorkbook } from '../lib/sheet-writer';
import {
    SheetRow,
    hasSheet,
    readSheet,
    readWorkbook,
} from '../lib/sheet-reader';
import {
    TableImportReport,
    emptyTableReport,
} from '../types/table-import-report.type';

const SHEET_COMPLECTS = 'complects';
const SHEET_PACKAGES = 'packages';
const COLUMN_CODE = 'code';

const COMPLECT_HEADERS = [
    COLUMN_CODE,
    'type',
    'productType',
    'name',
    'fullName',
    'shortName',
    'number',
    'weight',
    'abs',
    'color',
    'withABS',
    'withConsalting',
    'withServices',
    'withLt',
    'isChanging',
    'withDefault',
    'description',
];

const PACKAGE_HEADERS = [
    COLUMN_CODE,
    'type',
    'productType',
    'name',
    'fullName',
    'shortName',
    'number',
    'weight',
    'abs',
    'color',
    'withABS',
    'isChanging',
    'withDefault',
    'description',
];

const COMPLECT_FLAGS = [
    'withABS',
    'withConsalting',
    'withServices',
    'withLt',
    'isChanging',
    'withDefault',
] as const;

/**
 * Эталонная таблица карточек комплектов и пакетов. Составы инфоблоков в
 * файл НЕ входят (правятся точечно связками в админке) — таблица трогает
 * только параметры карточек, включая рабсы универсальной линейки и
 * консалтинга (у них вместо цен рабсы).
 */
@Injectable()
export class ComplectTableService {
    private readonly logger = new Logger(ComplectTableService.name);

    constructor(
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
    ) {}

    async export(): Promise<Buffer> {
        const [complects, packages] = await Promise.all([
            this.complectService.findAll(),
            this.packageService.findAll(),
        ]);
        const sortedComplects = [...(complects ?? [])].sort(
            (a, b) => a.number - b.number,
        );
        const sortedPackages = [...packages].sort(
            (a, b) => a.number - b.number,
        );

        return await writeWorkbook([
            {
                name: SHEET_COMPLECTS,
                headers: COMPLECT_HEADERS,
                widths: [
                    18, 12, 14, 26, 30, 22, 8, 10, 10, 10, 10, 14, 13, 8, 11,
                    12, 40,
                ],
                note:
                    'Карточки комплектов: ключ — code. type — prof или universal, ' +
                    'productType — garant/lt/star/consalting. abs — рабс (для универсальной ' +
                    'линейки цена = рабс × рабс региона × коэффициент поставки). ' +
                    'Состав инфоблоков правится в карточке комплекта, не здесь. ' +
                    'Пустая ячейка = поле не менять.',
                rows: sortedComplects.map(complect => [
                    complect.code,
                    complect.type,
                    complect.productType,
                    complect.name,
                    complect.fullName,
                    complect.shortName,
                    complect.number,
                    complect.weight,
                    complect.abs ?? null,
                    complect.color ?? null,
                    complect.withABS,
                    complect.withConsalting,
                    complect.withServices,
                    complect.withLt,
                    complect.isChanging,
                    complect.withDefault,
                    complect.description ?? null,
                ]),
            },
            {
                name: SHEET_PACKAGES,
                headers: PACKAGE_HEADERS,
                widths: [18, 12, 14, 26, 36, 22, 8, 10, 10, 10, 10, 11, 12, 40],
                note:
                    'Карточки пакетов услуг: ключ — code. productType — lt/star/consalting. ' +
                    'У консалтинга вместо цены рабс (abs): hotline 0, sovex 1, pkpremium 3. ' +
                    'Цены пакетов LT и СТАР — в таблице цен, лист services.',
                rows: sortedPackages.map((item): ExportCellValue[] => [
                    item.code,
                    item.type,
                    item.productType ?? null,
                    item.name,
                    item.fullName,
                    item.shortName,
                    item.number,
                    item.weight ?? null,
                    item.abs ?? null,
                    item.color ?? null,
                    item.withABS,
                    item.isChanging,
                    item.withDefault,
                    item.description ?? null,
                ]),
            },
        ]);
    }

    async import(
        buffer: Buffer,
        dryRun: boolean,
    ): Promise<TableImportReport[]> {
        const workbook = await readWorkbook(buffer);
        const reports: TableImportReport[] = [];

        const complectSheet = readSheet(workbook, SHEET_COMPLECTS);
        complectSheet.requireColumns([COLUMN_CODE]);
        reports.push(await this.importComplects(complectSheet.rows, dryRun));

        if (hasSheet(workbook, SHEET_PACKAGES)) {
            const packageSheet = readSheet(workbook, SHEET_PACKAGES);
            packageSheet.requireColumns([COLUMN_CODE]);
            reports.push(await this.importPackages(packageSheet.rows, dryRun));
        }

        return reports;
    }

    private async importComplects(
        rows: SheetRow[],
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const report = emptyTableReport(SHEET_COMPLECTS);
        const existing = (await this.complectService.findAll()) ?? [];
        const byCode = new Map<string, ComplectEntity>(
            existing.map(complect => [complect.code, complect]),
        );

        for (const row of rows) {
            const code = row.string(COLUMN_CODE);
            if (code === '') {
                report.skipped.push({
                    key: `строка ${row.rowNumber}`,
                    reason: `пустой ${COLUMN_CODE}`,
                });
                continue;
            }
            const current = byCode.get(code);
            const type = this.readComplectType(row);
            const productType = this.readComplectProductType(row);
            if (type === 'invalid' || productType === 'invalid') {
                report.skipped.push({
                    key: code,
                    reason: 'type должен быть prof|universal, productType — garant|lt|star|consalting',
                });
                continue;
            }

            if (!current) {
                const name = row.nullableString('name');
                if (!name || type === null || productType === null) {
                    report.skipped.push({
                        key: code,
                        reason: 'новый комплект требует name, type и productType',
                    });
                    continue;
                }
                if (!dryRun) {
                    const created = await this.complectService.create({
                        code,
                        type,
                        productType,
                        name,
                        fullName: row.nullableString('fullName') ?? name,
                        shortName: row.nullableString('shortName') ?? name,
                        number: row.number('number') ?? 0,
                        weight: row.number('weight') ?? 0,
                        abs: row.nullableString('abs') ?? undefined,
                        color: row.nullableString('color') ?? '',
                        description:
                            row.nullableString('description') ?? undefined,
                        withABS: row.boolean('withABS'),
                        withConsalting: row.boolean('withConsalting'),
                        withServices: row.boolean('withServices'),
                        withLt: row.boolean('withLt'),
                        isChanging: row.boolean('isChanging'),
                        withDefault: row.boolean('withDefault'),
                        infoblockIds: [],
                    });
                    if (!created) {
                        report.skipped.push({
                            key: code,
                            reason: 'ошибка создания комплекта',
                        });
                        continue;
                    }
                }
                report.created += 1;
                continue;
            }

            const dto = this.mergeComplect(current, row, type, productType);
            if (!dto) {
                report.unchanged += 1;
                continue;
            }
            if (!dryRun) {
                const updated = await this.complectService.update(
                    current.id,
                    dto,
                );
                if (!updated) {
                    report.skipped.push({
                        key: code,
                        reason: 'ошибка обновления комплекта',
                    });
                    continue;
                }
            }
            report.updated += 1;
        }

        this.logger.log(
            `Комплекты: создано ${report.created}, обновлено ${report.updated}, ` +
                `без изменений ${report.unchanged}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    /**
     * Полный DTO для update (сервис собирает сущность с нуля, поэтому
     * несказанные поля надо перенести из текущей записи), либо null,
     * если файл ничего не меняет.
     */
    private mergeComplect(
        current: ComplectEntity,
        row: SheetRow,
        type: ComplectTypeEnum | null,
        productType: ComplectProductTypeEnum | null,
    ): CreateComplectDto | null {
        const text = (column: string, fallback: string): string =>
            row.nullableString(column) ?? fallback;
        const num = (column: string, fallback: number): number =>
            row.has(column) ? (row.number(column) ?? fallback) : fallback;
        const flag = (column: string, fallback: boolean): boolean =>
            row.nullableString(column) === null
                ? fallback
                : row.boolean(column);

        const dto: CreateComplectDto = {
            code: current.code,
            type: type ?? current.type,
            productType: productType ?? current.productType,
            name: text('name', current.name),
            fullName: text('fullName', current.fullName),
            shortName: text('shortName', current.shortName),
            number: num('number', current.number),
            weight: num('weight', current.weight),
            abs: row.nullableString('abs') ?? current.abs,
            color: row.nullableString('color') ?? current.color,
            description:
                row.nullableString('description') ?? current.description,
            withABS: flag('withABS', current.withABS),
            withConsalting: flag('withConsalting', current.withConsalting),
            withServices: flag('withServices', current.withServices),
            withLt: flag('withLt', current.withLt),
            isChanging: flag('isChanging', current.isChanging),
            withDefault: flag('withDefault', current.withDefault),
            // Составы инфоблоков таблица не трогает.
            infoblockIds: (current.infoblocks ?? []).map(infoblock =>
                String(infoblock.id),
            ),
        };

        const changed =
            dto.type !== current.type ||
            dto.productType !== current.productType ||
            dto.name !== current.name ||
            dto.fullName !== current.fullName ||
            dto.shortName !== current.shortName ||
            dto.number !== current.number ||
            dto.weight !== current.weight ||
            (dto.abs ?? null) !== (current.abs ?? null) ||
            (dto.color ?? null) !== (current.color ?? null) ||
            (dto.description ?? null) !== (current.description ?? null) ||
            COMPLECT_FLAGS.some(
                flagName => dto[flagName] !== current[flagName],
            );

        return changed ? dto : null;
    }

    private async importPackages(
        rows: SheetRow[],
        dryRun: boolean,
    ): Promise<TableImportReport> {
        const report = emptyTableReport(SHEET_PACKAGES);
        const existing = await this.packageService.findAll();
        const byCode = new Map(existing.map(item => [item.code, item]));

        for (const row of rows) {
            const code = row.string(COLUMN_CODE);
            if (code === '') {
                report.skipped.push({
                    key: `строка ${row.rowNumber}`,
                    reason: `пустой ${COLUMN_CODE}`,
                });
                continue;
            }
            const productType = this.readPackageProductType(row);
            if (productType === 'invalid') {
                report.skipped.push({
                    key: code,
                    reason: 'productType должен быть garant|lt|star|consalting',
                });
                continue;
            }
            const current = byCode.get(code);

            if (!current) {
                const name = row.nullableString('name');
                if (!name) {
                    report.skipped.push({
                        key: code,
                        reason: 'новый пакет требует name',
                    });
                    continue;
                }
                if (!dryRun) {
                    const dto: PackageCreateDto = {
                        code,
                        name,
                        fullName: row.nullableString('fullName') ?? name,
                        shortName: row.nullableString('shortName') ?? name,
                        type: PackageTypeEnum.PROF,
                        productType: productType ?? undefined,
                        number: row.number('number') ?? 0,
                        weight: row.number('weight') ?? undefined,
                        abs: row.number('abs') ?? undefined,
                        color: row.nullableString('color') ?? undefined,
                        description:
                            row.nullableString('description') ?? undefined,
                        withABS: row.boolean('withABS'),
                        isChanging: row.boolean('isChanging'),
                        withDefault: row.boolean('withDefault'),
                    };
                    try {
                        await this.packageService.create(dto);
                    } catch (error) {
                        report.skipped.push({
                            key: code,
                            reason:
                                error instanceof Error
                                    ? error.message
                                    : 'ошибка создания пакета',
                        });
                        continue;
                    }
                }
                report.created += 1;
                continue;
            }

            const patch = this.buildPackagePatch(row, current, productType);
            if (!patch) {
                report.unchanged += 1;
                continue;
            }
            if (!dryRun) {
                try {
                    await this.packageService.update(String(current.id), patch);
                } catch (error) {
                    report.skipped.push({
                        key: code,
                        reason:
                            error instanceof Error
                                ? error.message
                                : 'ошибка обновления пакета',
                    });
                    continue;
                }
            }
            report.updated += 1;
        }

        this.logger.log(
            `Пакеты: создано ${report.created}, обновлено ${report.updated}, ` +
                `без изменений ${report.unchanged}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    private buildPackagePatch(
        row: SheetRow,
        current: {
            name: string;
            fullName: string;
            shortName: string;
            number: number;
            weight?: number;
            abs?: number;
            color?: string;
            description?: string;
            productType?: string;
            withABS: boolean;
            isChanging: boolean;
            withDefault: boolean;
        },
        productType: PackageProductTypeEnum | null,
    ): PackageUpdateDto | null {
        const patch: PackageUpdateDto = {};
        const setText = (
            column: string,
            field: 'name' | 'fullName' | 'shortName' | 'color' | 'description',
        ): void => {
            const value = row.nullableString(column);
            if (value !== null && value !== current[field]) {
                patch[field] = value;
            }
        };
        setText('name', 'name');
        setText('fullName', 'fullName');
        setText('shortName', 'shortName');
        setText('color', 'color');
        setText('description', 'description');

        for (const field of ['number', 'weight', 'abs'] as const) {
            if (!row.has(field)) continue;
            const value = row.number(field);
            if (value !== null && value !== current[field]) {
                patch[field] = value;
            }
        }
        for (const field of ['withABS', 'isChanging', 'withDefault'] as const) {
            if (row.nullableString(field) === null) continue;
            const value = row.boolean(field);
            if (value !== current[field]) patch[field] = value;
        }
        if (productType && productType !== current.productType) {
            patch.productType = productType;
        }

        return Object.keys(patch).length > 0 ? patch : null;
    }

    /** null — колонка пуста (не менять), 'invalid' — мусор в колонке */
    private readComplectType(
        row: SheetRow,
    ): ComplectTypeEnum | null | 'invalid' {
        const raw = row.nullableString('type');
        if (raw === null) return null;
        const values: string[] = Object.values(ComplectTypeEnum);
        return values.includes(raw) ? (raw as ComplectTypeEnum) : 'invalid';
    }

    private readComplectProductType(
        row: SheetRow,
    ): ComplectProductTypeEnum | null | 'invalid' {
        const raw = row.nullableString('productType');
        if (raw === null) return null;
        const values: string[] = Object.values(ComplectProductTypeEnum);
        return values.includes(raw)
            ? (raw as ComplectProductTypeEnum)
            : 'invalid';
    }

    private readPackageProductType(
        row: SheetRow,
    ): PackageProductTypeEnum | null | 'invalid' {
        const raw = row.nullableString('productType');
        if (raw === null) return null;
        const values: string[] = Object.values(PackageProductTypeEnum);
        return values.includes(raw)
            ? (raw as PackageProductTypeEnum)
            : 'invalid';
    }
}
