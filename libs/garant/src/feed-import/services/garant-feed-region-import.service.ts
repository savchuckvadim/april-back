import { Injectable, Logger } from '@nestjs/common';
import { RegionService } from '../../region/region.service';
import { RegionEntity } from '../../region/region.entity';
import {
    emptyReport,
    FeedRegionRow,
    ImportSectionReport,
} from '../types/garant-feed.types';

/** НДС-множитель для tax_abs — как в региональном excel-пайплайне */
const DEFAULT_TAX = 1.2;

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Импорт регионального справочника из Google-фида: рабс региона (abs)
 * меняется так же часто, как цены prof, — обновляется по коду региона.
 * Существующие title/infoblock не перетираются (в БД они уже выверены),
 * отсутствующие регионы создаются целиком.
 */
@Injectable()
export class GarantFeedRegionImportService {
    private readonly logger = new Logger(GarantFeedRegionImportService.name);

    constructor(private readonly regionService: RegionService) {}

    async import(
        rows: FeedRegionRow[],
        dryRun: boolean,
    ): Promise<ImportSectionReport> {
        const report = emptyReport('regions');
        const existing = (await this.regionService.findAll()) ?? [];
        const byCode = new Map<string, RegionEntity>(
            existing.map(region => [region.code, region]),
        );

        for (const row of rows) {
            if (row.abs <= 0) {
                report.skipped.push({
                    key: row.name,
                    reason: `рабс ${row.abs} — не положительный`,
                });
                continue;
            }
            const current = byCode.get(row.name);
            if (!current) {
                if (!dryRun) {
                    const created = await this.regionService.create(
                        this.buildNewRegion(row),
                    );
                    if (!created) {
                        report.skipped.push({
                            key: row.name,
                            reason: 'ошибка создания региона',
                        });
                        continue;
                    }
                }
                report.created += 1;
                continue;
            }

            const tax = current.tax > 0 ? current.tax : DEFAULT_TAX;
            const nextAbs = round2(row.abs);
            const nextTaxAbs = round2(row.abs * tax);
            if (current.abs === nextAbs && current.tax_abs === nextTaxAbs) {
                continue; // без изменений — не трогаем updated_at
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
                        key: row.name,
                        reason: 'ошибка обновления региона',
                    });
                    continue;
                }
            }
            report.updated += 1;
        }

        this.logger.log(
            `Регионы: создано ${report.created}, обновлено ${report.updated}, пропущено ${report.skipped.length}`,
        );
        return report;
    }

    private buildNewRegion(row: FeedRegionRow): Partial<RegionEntity> {
        return {
            number: row.number,
            title: row.title,
            code: row.name,
            infoblock: row.infoblock,
            abs: round2(row.abs),
            tax: DEFAULT_TAX,
            tax_abs: round2(row.abs * DEFAULT_TAX),
        };
    }
}
