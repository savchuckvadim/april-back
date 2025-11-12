import { CallingTypeAction } from "./calling-statistic.type";

export interface IExcelReport {

    userName: string;
    kpi: {
        id?: string | number;
        action: CallingTypeAction | string;
        count: number;

    }[];
}
