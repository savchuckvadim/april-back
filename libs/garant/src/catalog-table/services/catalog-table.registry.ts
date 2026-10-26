import { Injectable } from '@nestjs/common';
import { PriceTableExportService } from './price-table-export.service';
import { PriceTableImportService } from './price-table-import.service';
import { RegionTableService } from './region-table.service';
import { SupplyTableService } from './supply-table.service';
import { ComplectTableService } from './complect-table.service';
import { TableImportReport } from '../types/table-import-report.type';

/** Таблицы каталога, доступные для выгрузки/загрузки */
export const CATALOG_TABLE_KINDS = [
    'prices',
    'regions',
    'supplies',
    'complects',
] as const;

export type CatalogTableKind = (typeof CATALOG_TABLE_KINDS)[number];

/** Единый контракт таблицы: эталон наружу, отчёт внутрь */
export interface CatalogTable {
    export: () => Promise<Buffer>;
    import: (buffer: Buffer, dryRun: boolean) => Promise<TableImportReport[]>;
}

/**
 * Реестр эталонных таблиц каталога — чтобы контроллер не разрастался
 * ручкой на каждую сущность (одна пара export/import на всё).
 */
@Injectable()
export class CatalogTableRegistry {
    private readonly tables: Record<CatalogTableKind, CatalogTable>;

    constructor(
        priceExport: PriceTableExportService,
        priceImport: PriceTableImportService,
        regions: RegionTableService,
        supplies: SupplyTableService,
        complects: ComplectTableService,
    ) {
        this.tables = {
            prices: {
                export: () => priceExport.export(),
                import: (buffer, dryRun) => priceImport.import(buffer, dryRun),
            },
            regions: {
                export: () => regions.export(),
                import: (buffer, dryRun) => regions.import(buffer, dryRun),
            },
            supplies: {
                export: () => supplies.export(),
                import: (buffer, dryRun) => supplies.import(buffer, dryRun),
            },
            complects: {
                export: () => complects.export(),
                import: (buffer, dryRun) => complects.import(buffer, dryRun),
            },
        };
    }

    get(kind: CatalogTableKind): CatalogTable | null {
        return this.tables[kind] ?? null;
    }
}
