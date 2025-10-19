import {
    Controller,
    HttpCode,
    Post,
    Body,
    Res,
    UseInterceptors,

} from '@nestjs/common';
// import { ExcelReportService } from './services/kpi-report/kpi-report.service';
import { ReportGetRequestDto } from './dto/kpi-report-request.dto';
import { ReportKpiUseCase } from './usecases/kpi-report.use-case';
import { GetCallingStatisticDto } from './dto/calling-statistic.dto';
import { CallingStatisticUseCase } from './usecases/kpi-calling-statistic.use-case';
import { PBXService } from '@/modules/pbx';

@Controller('kpi-report')
export class KpiReportController {
    constructor(
        // private readonly excelService: ExcelReportService,
        private readonly pbx: PBXService,
        // private readonly reportKpiUseCase: ReportKpiUseCase,
        // private readonly callingStatisticUseCase: CallingStatisticUseCase,
    ) {}

    @Post('get')
    @HttpCode(200)
    @UseInterceptors()
    async getReport(@Body() dto: ReportGetRequestDto) {
        const domain = dto.domain;
        const filters = dto.filters;
        const reportKpiUseCase = new ReportKpiUseCase();
        await reportKpiUseCase.init(domain, this.pbx);
        const result = await reportKpiUseCase.generateKpiReport(filters);
        return result;
    }

    @Post('calling-statistic')
    @HttpCode(200)
    @UseInterceptors()
    async getCallingStatistic(@Body() dto: GetCallingStatisticDto) {
        // const domain = dto.domain;
        const filters = dto.filters;
        const {bitrix} = await this.pbx.init(dto.domain);
        const callingStatisticUseCase = new CallingStatisticUseCase(bitrix.api);
        // await this.callingStatisticUseCase.init(domain);
        const result = await callingStatisticUseCase.get(dto);
        return result;
    }
}
