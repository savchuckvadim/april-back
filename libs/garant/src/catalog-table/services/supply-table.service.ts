import { Injectable, Logger } from '@nestjs/common';
import { SupplyService } from '../../supply/services/api/supply.service';
import { SupplyEntity } from '../../supply/supply.entity';
import { ExportCellValue, writeWorkbook } from '../lib/sheet-writer';
import { SheetRow, readSheet, readWorkbook } from '../lib/sheet-reader';
import {
    TableImportReport,
    emptyTableReport,
} from '../types/table-import-report.type';
import { supplyCodeFromNumber } from '../../catalog-install/lib/catalog-codes';
import { SUPPLY_REFS } from '../lib/catalog-row-resolve';

const SHEET = 'supplies';
/** Имя листа в легаси-выгрузке — единственное число */
const SHEET_LEGACY = 'supply';
const COLUMN_CODE = 'code';
/** Номер поставки в легаси-выгрузке (0–18) — альтернативный ключ */
const COLUMN_NUMBER = 'number';
const COLUMN_TYPE = 'type';
const COLUMN_USERS = 'usersQuantity';
const COLUMN_COEFFICIENT = 'coefficient';

/** Числовые колонки поставки */
const NUMBER_COLUMNS = [COLUMN_USERS, COLUMN_COEFFICIENT] as const;

/** Текстовые колонки: имена и шаблоны текстов договоров/КП */
const TEXT_COLUMNS = [
    'name',
    'fullName',
    'shortName',
    'quantityForKp',
    'contractName',
    'contractProp1',
    'contractProp2',
    'contractPropSuppliesQuantity',
    'contractPropLoginsQuantity',
    'contractPropComment',
    'contractPropEmail',
    'lcontractName',
    'lcontractProp2',
    'lcontractPropComment',
    'lcontractPropEmail',
    'acontractName',
    'acontractPropComment',
    'saleName_1',
    'saleName_2',
    'saleName_3',
    'description',
    'color',
] as const;

type TextColumn = (typeof TEXT_COLUMNS)[number];

const HEADERS = [
    COLUMN_CODE,
    COLUMN_TYPE,
    COLUMN_USERS,
    COLUMN_COEFFICIENT,
    ...TEXT_COLUMNS,
];

/**
 * Эталонная таблица видов поставок: коды, тип, число ОД, коэффициент и
 * шаблоны текстов договоров/КП (в них подставляется число ОД —
 * см. supply-template.util). Создание новой поставки — новая строка.
 */
@Injectable()
export class SupplyTableService {
    private readonly logger = new Logger(SupplyTableService.name);

    constructor(private readonly supplyService: SupplyService) {}

    async export(): Promise<Buffer> {
        const supplies = (await this.supplyService.findMany()) ?? [];
        const sorted = [...supplies].sort((a, b) =>
            a.type === b.type
                ? a.usersQuantity - b.usersQuantity
                : a.type.localeCompare(b.type),
        );
        return await writeWorkbook([
            {
                name: SHEET,
                headers: HEADERS,
                widths: [18, 12, 8, 12, ...TEXT_COLUMNS.map(() => 34)],
                note:
                    'Виды поставок: ключ — code (internet_5, proxima_local, proxima_flash…). ' +
                    'type — internet или proxima, usersQuantity — число ОД, coefficient — ' +
                    'множитель цены. Тексты договоров поддерживают подстановку числа ОД: ' +
                    '{n} — число, {words} — прописью, {plural:ОД|ОД|ОД}. ' +
                    'Пустая ячейка = поле не менять.',
                rows: sorted.map(supply => this.toRow(supply)),
            },
        ]);
    }

    async import(
        buffer: Buffer,
        dryRun: boolean,
    ): Promise<TableImportReport[]> {
        const workbook = await readWorkbook(buffer);
        // Лист «supply» (единственное число) — так он назван в легаси-выгрузке
        const sheetName = workbook.worksheets.some(
            worksheet => worksheet.name.trim().toLowerCase() === SHEET_LEGACY,
        )
            ? SHEET_LEGACY
            : SHEET;
        const sheet = readSheet(workbook, sheetName);
        // Ключ — code, но принимаем и number: в легаси-выгрузках поставки
        // пронумерованы 0–18, и такие файлы грузятся без переделки.
        const hasCode = sheet.hasColumn(COLUMN_CODE);
        if (!hasCode) sheet.requireColumns([COLUMN_NUMBER]);

        const report = emptyTableReport(sheetName);
        const existing = (await this.supplyService.findMany()) ?? [];
        const byCode = new Map<string, SupplyEntity>(
            existing.map(supply => [supply.code, supply]),
        );

        for (const row of sheet.rows) {
            const code = hasCode
                ? row.string(COLUMN_CODE)
                : (supplyCodeFromNumber(row.number(COLUMN_NUMBER) ?? -1) ?? '');
            if (code === '') {
                report.skipped.push({
                    key: `строка ${row.rowNumber}`,
                    reason: hasCode
                        ? `пустой ${COLUMN_CODE}`
                        : `по номеру в колонке «${COLUMN_NUMBER}» не удалось определить код поставки`,
                });
                continue;
            }
            const current = byCode.get(code);

            if (!current) {
                // Эталон по коду: в легаси-выгрузке нет колонок
                // usersQuantity и type — они однозначно выводятся из номера
                const ref = SUPPLY_REFS.find(item => item.code === code);
                const type = row.has(COLUMN_TYPE)
                    ? row.string(COLUMN_TYPE)
                    : (ref?.type ?? '');
                const name = row.nullableString('name') ?? ref?.name ?? null;
                const users = row.has(COLUMN_USERS)
                    ? row.number(COLUMN_USERS)
                    : (ref?.usersQuantity ?? null);
                if (
                    (type !== 'internet' && type !== 'proxima') ||
                    !name ||
                    users === null
                ) {
                    report.skipped.push({
                        key: code,
                        reason: 'новая поставка требует тип (internet или proxima), название и число одновременных доступов',
                    });
                    continue;
                }
                if (!dryRun) {
                    const created = await this.supplyService.create({
                        code,
                        type,
                        name,
                        fullName: row.nullableString('fullName') ?? name,
                        shortName: row.nullableString('shortName') ?? name,
                        usersQuantity: users,
                        coefficient: row.number(COLUMN_COEFFICIENT) ?? 1,
                        ...this.textPatch(row, null),
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
                continue;
            }

            const patch = this.buildPatch(row, current);
            if (!patch) {
                report.unchanged += 1;
                continue;
            }
            if (!dryRun) {
                const updated = await this.supplyService.update({
                    id: current.id,
                    ...patch,
                });
                if (!updated) {
                    report.skipped.push({
                        key: code,
                        reason: 'ошибка обновления поставки',
                    });
                    continue;
                }
            }
            report.updated += 1;
        }

        this.logger.log(
            `Поставки: создано ${report.created}, обновлено ${report.updated}, ` +
                `без изменений ${report.unchanged}, пропущено ${report.skipped.length}`,
        );
        return [report];
    }

    private toRow(supply: SupplyEntity): ExportCellValue[] {
        return [
            supply.code,
            supply.type,
            supply.usersQuantity,
            supply.coefficient,
            ...TEXT_COLUMNS.map(column => supply[column] ?? null),
        ];
    }

    /** Патч изменившихся полей; null — всё совпало */
    private buildPatch(
        row: SheetRow,
        current: SupplyEntity,
    ): Partial<SupplyEntity> | null {
        const patch: Partial<SupplyEntity> = {};

        const type = row.nullableString(COLUMN_TYPE);
        if (
            type !== null &&
            (type === 'internet' || type === 'proxima') &&
            type !== current.type
        ) {
            patch.type = type;
        }
        for (const column of NUMBER_COLUMNS) {
            if (!row.has(column)) continue;
            const value = row.number(column);
            if (value === null || value === current[column]) continue;
            patch[column] = value;
        }
        Object.assign(patch, this.textPatch(row, current));

        return Object.keys(patch).length > 0 ? patch : null;
    }

    /** Текстовые поля: пустая ячейка — не менять */
    private textPatch(
        row: SheetRow,
        current: SupplyEntity | null,
    ): Partial<Record<TextColumn, string>> {
        const patch: Partial<Record<TextColumn, string>> = {};
        for (const column of TEXT_COLUMNS) {
            if (!row.has(column)) continue;
            const value = row.nullableString(column);
            if (value === null) continue;
            if (current && current[column] === value) continue;
            patch[column] = value;
        }
        return patch;
    }
}
