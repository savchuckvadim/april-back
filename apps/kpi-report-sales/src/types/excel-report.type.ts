export interface IExcelReport {
    userName: string;
    kpi: {
        id?: string | number;
        action: string;
        count: number;
    }[];
}
