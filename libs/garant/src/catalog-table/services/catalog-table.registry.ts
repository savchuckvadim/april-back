import { Injectable } from '@nestjs/common';
import {
    PriceBookExportService,
    PriceBookMode,
} from './price-book-export.service';
import { PriceBookImportService } from './price-book-import.service';
import { SupplyTableService } from './supply-table.service';
import { ComplectTableService } from './complect-table.service';
import { TableImportReport } from '../types/table-import-report.type';

/**
 * Таблицы каталога:
 * - prices    книга цен в формате рабочего файла (7 листов: рабсы регионов,
 *             веса и АБС универсальной линейки, прайс PROF по ОД,
 *             пакеты услуг, АБС консалтинга) — одно действие на все цены;
 * - supplies  виды поставок: параметры и тексты договоров, без цен;
 * - complects карточки комплектов и пакетов.
 */
export const CATALOG_TABLE_KINDS = ['prices', 'supplies', 'complects'] as const;

export type CatalogTableKind = (typeof CATALOG_TABLE_KINDS)[number];

/** Единый контракт таблицы: эталон наружу, отчёт внутрь */
export interface CatalogTable {
    /** `blank` поддерживает только книга цен; остальные игнорируют режим */
    export: (mode: PriceBookMode) => Promise<Buffer>;
    import: (buffer: Buffer, dryRun: boolean) => Promise<TableImportReport[]>;
    /** Можно ли скачать пустой шаблон */
    supportsBlank: boolean;
}

/**
 * Реестр таблиц каталога — чтобы контроллер не разрастался ручкой на
 * каждую сущность (одна пара export/import на всё).
 */
@Injectable()
export class CatalogTableRegistry {
    private readonly tables: Record<CatalogTableKind, CatalogTable>;

    constructor(
        priceExport: PriceBookExportService,
        priceImport: PriceBookImportService,
        supplies: SupplyTableService,
        complects: ComplectTableService,
    ) {
        this.tables = {
            prices: {
                export: mode => priceExport.export(mode),
                import: (buffer, dryRun) => priceImport.import(buffer, dryRun),
                supportsBlank: true,
            },
            supplies: {
                export: () => supplies.export(),
                import: (buffer, dryRun) => supplies.import(buffer, dryRun),
                supportsBlank: false,
            },
            complects: {
                export: () => complects.export(),
                import: (buffer, dryRun) => complects.import(buffer, dryRun),
                supportsBlank: false,
            },
        };
    }

    get(kind: CatalogTableKind): CatalogTable | null {
        return this.tables[kind] ?? null;
    }
}
