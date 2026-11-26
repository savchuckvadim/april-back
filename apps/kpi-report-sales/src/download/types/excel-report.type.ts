import type { DownloadKpiItemKind } from '../lib/excel-plan-columns.util';

export interface IExcelReport {
    userName: string;
    kpi: {
        id?: string | number;
        action: string;
        /** У плановой колонки null — плана нет. */
        count: number | null;
        /** «plan» — колонка плана перед своим показателем. */
        kind?: DownloadKpiItemKind;
        /** Заметка к шапке плановой колонки. */
        note?: string;
    }[];
}
