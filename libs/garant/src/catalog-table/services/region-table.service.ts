import { Injectable, Logger } from '@nestjs/common';
import { RegionService } from '../../region/region.service';
import { RegionEntity } from '../../region/region.entity';
import { writeWorkbook } from '../lib/sheet-writer';
import { readSheet, readWorkbook } from '../lib/sheet-reader';
import {
    TableImportReport,
    emptyTableReport,
} from '../types/table-import-report.type';

const SHEET = 'regions';
const COLUMN_CODE = 'code';
const COLUMN_TITLE = 'title';
const COLUMN_INFOBLOCK = 'infoblock';
const COLUMN_ABS = 'abs';
const COLUMN_NUMBER = 'number';

/** НДС-множитель: tax_abs = abs × tax, считается бэком */
const DEFAULT_TAX = 1.2;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Эталонная таблица регионов: рабс региона (abs) меняется так же часто,
 * как цены prof, поэтому правится таблицей. tax и tax_abs считает бэк —
 * в файле их нет, чтобы не разъезжались.
 */
@Injectable()
export class RegionTableService {
    private readonly logger = new Logger(RegionTableService.name);

    constructor(private readonly regionService: RegionService) {}

    async export(): Promise<Buffer> {
        const regions = (await this.regionService.findAll()) ?? [];
        const sorted = [...regions].sort((a, b) => a.number - b.number);
        return await writeWorkbook([
            {
                name: SHEET,
                headers: [
                    COLUMN_CODE,
                    COLUMN_TITLE,
                    COLUMN_INFOBLOCK,
                    COLUMN_ABS,
                    COLUMN_NUMBER,
                ],
                widths: [14, 32, 44, 14, 10],
                note:
                    'Регионы: ключ — code. abs — рабс региона (руб.), НДС и рабс с НДС ' +
                    'считает система. Новый регион — новая строка с новым code. ' +
                    'Пустой abs = не менять.',
                rows: sorted.map(region => [
                    region.code,
                    region.title,
                    region.infoblock,
                    region.abs,
                    region.number,
                ]),
            },
        ]);
    }

    async import(
        buffer: Buffer,
        dryRun: boolean,
    ): Promise<TableImportReport[]> {
        const workbook = await readWorkbook(buffer);
        const sheet = readSheet(workbook, SHEET);
        sheet.requireColumns([COLUMN_CODE]);

        const report = emptyTableReport(SHEET);
        const existing = (await this.regionService.findAll()) ?? [];
        const byCode = new Map<string, RegionEntity>(
            existing.map(region => [region.code, region]),
        );
        let maxNumber = existing.reduce(
            (max, region) => Math.max(max, region.number),
            -1,
        );

        for (const row of sheet.rows) {
            const code = row.string(COLUMN_CODE);
            if (code === '') {
                report.skipped.push({
                    key: `строка ${row.rowNumber}`,
                    reason: `пустой ${COLUMN_CODE}`,
                });
                continue;
            }
            const current = byCode.get(code);
            const abs = row.number(COLUMN_ABS);
            const rawAbs = row.nullableString(COLUMN_ABS);
            if (rawAbs !== null && abs === null) {
                report.skipped.push({
                    key: code,
                    reason: `значение рабса «${rawAbs}» не похоже на число`,
                });
                continue;
            }

            if (!current) {
                const title = row.nullableString(COLUMN_TITLE);
                if (!title || abs === null || abs <= 0) {
                    report.skipped.push({
                        key: code,
                        reason: 'новый регион требует title и положительный abs',
                    });
                    continue;
                }
                maxNumber += 1;
                if (!dryRun) {
                    const created = await this.regionService.create({
                        code,
                        title,
                        infoblock: row.string(COLUMN_INFOBLOCK),
                        number: row.number(COLUMN_NUMBER) ?? maxNumber,
                        abs: round2(abs),
                        tax: DEFAULT_TAX,
                        tax_abs: round2(abs * DEFAULT_TAX),
                    });
                    if (!created) {
                        report.skipped.push({
                            key: code,
                            reason: 'ошибка создания региона',
                        });
                        continue;
                    }
                }
                report.created += 1;
                continue;
            }

            const patch = this.buildPatch(
                current,
                row.nullableString(COLUMN_TITLE),
                row.nullableString(COLUMN_INFOBLOCK),
                abs,
            );
            if (!patch) {
                report.unchanged += 1;
                continue;
            }
            if (!dryRun) {
                const updated = await this.regionService.update({
                    id: current.id,
                    ...patch,
                });
                if (!updated) {
                    report.skipped.push({
                        key: code,
                        reason: 'ошибка обновления региона',
                    });
                    continue;
                }
            }
            report.updated += 1;
        }

        this.logger.log(
            `Регионы: создано ${report.created}, обновлено ${report.updated}, ` +
                `без изменений ${report.unchanged}, пропущено ${report.skipped.length}`,
        );
        return [report];
    }

    /** Патч только изменившихся полей; null — всё совпало */
    private buildPatch(
        current: RegionEntity,
        title: string | null,
        infoblock: string | null,
        abs: number | null,
    ): Partial<RegionEntity> | null {
        const patch: Partial<RegionEntity> = {};
        if (title !== null && title !== current.title) patch.title = title;
        if (infoblock !== null && infoblock !== current.infoblock) {
            patch.infoblock = infoblock;
        }
        if (abs !== null) {
            const nextAbs = round2(abs);
            const tax = current.tax > 0 ? current.tax : DEFAULT_TAX;
            const nextTaxAbs = round2(nextAbs * tax);
            if (
                nextAbs !== current.abs ||
                nextTaxAbs !== current.tax_abs ||
                tax !== current.tax
            ) {
                patch.abs = nextAbs;
                patch.tax = tax;
                patch.tax_abs = nextTaxAbs;
            }
        }
        return Object.keys(patch).length > 0 ? patch : null;
    }
}
