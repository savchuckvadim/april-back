import { Process, Processor } from "@nestjs/bull";
import { QueueNames } from "src/modules/queue/constants/queue-names.enum";
import { ReportKpiUseCase } from "../usecases/kpi-report.use-case";
import { JobNames } from "src/modules/queue/constants/job-names.enum";
import { Job } from "bull";
import { ReportKpiJob } from "../dto/report-kpi.job.dto";
import { WsService } from "src/core/ws";
import { Logger } from "@nestjs/common";


@Processor(QueueNames.SALES_KPI_REPORT)
export class SalesKpiReportQueueProcessor {
    private readonly logger = new Logger(QueueNames.SALES_KPI_REPORT);

    constructor(

        private readonly reportKpi: ReportKpiUseCase,
        private readonly ws: WsService // WebSocket шлюз
    ) { 

        this.logger.log('constructor SALES_KPI_REPORT_GENERATE')
    }

    @Process(JobNames.SALES_KPI_REPORT_GENERATE)
    async handle(job: Job<ReportKpiJob>) {
        const { domain, filters, socketId } = job.data;
        this.logger.log('SALES_KPI_REPORT_GENERATE')
        await this.reportKpi.init(domain);
        const result = await this.reportKpi.generateKpiReport(filters);
     
        // this.logger.log(job)
        // Отправляем по WebSocket
        if (socketId) {
            this.logger.log('SEND WS SALES_KPI_REPORT_GENERATE')
            this.logger.log(socketId)
            this.ws.sendToClient(socketId, {
                event: 'kpi-report:done',
                data: result
            });
        }
    }
}
