import { ReportGetFiltersDto } from "./kpi-report-request.dto";

// report-kpi.job.ts
export interface ReportKpiJob {
    domain: string;
    filters: ReportGetFiltersDto;
    socketId?: string; // id WebSocket клиента
  }// report-kpi.job.ts
